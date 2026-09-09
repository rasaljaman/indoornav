/**
 * Positioning & Dead-Reckoning Engine
 * 
 * Provides:
 * 1. Step detection from accelerometer (linear acceleration peak detection with ~300ms debounce).
 * 2. Heading sensor fusion via complementary filter (gyro yaw rate integration + ~1% compass pull).
 * 3. Dead reckoning forward projection (step length in meters converted to map pixels).
 * 4. Orthogonal edge-snapping onto the corridor graph (from nodes & edges).
 * 5. Silent re-anchoring on QR code scans.
 * 6. iOS and Android permission detection and request flows.
 */

/**
 * Calculates the orthogonal projection of point P(px, py) onto line segment AB.
 * Returns the closest point on the segment and the Euclidean distance.
 */
export function projectPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const distSq = (px - ax) ** 2 + (py - ay) ** 2;
    return { x: ax, y: ay, dist: Math.sqrt(distSq), t: 0 };
  }

  // Projection parameter t clamped to [0, 1]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

  return { x: projX, y: projY, dist, t };
}

/**
 * Snaps a 2D coordinate to the nearest point on any edge in the corridor graph.
 * If no edges exist, snaps to the nearest node, or returns original point.
 */
export function snapToCorridorGraph(px, py, nodes = [], edges = []) {
  if (!nodes || nodes.length === 0) {
    return { x: px, y: py, edge: null, distance: 0 };
  }

  const nodesMap = new Map(nodes.map(n => [n.id, n]));
  let closestPoint = null;
  let minDistance = Infinity;
  let matchedEdge = null;

  if (edges && edges.length > 0) {
    for (const edge of edges) {
      const nodeA = nodesMap.get(edge.from_node);
      const nodeB = nodesMap.get(edge.to_node);
      if (!nodeA || !nodeB) continue;

      const proj = projectPointToSegment(px, py, nodeA.x, nodeA.y, nodeB.x, nodeB.y);
      if (proj.dist < minDistance) {
        minDistance = proj.dist;
        closestPoint = { x: proj.x, y: proj.y };
        matchedEdge = edge;
      }
    }
  }

  // If no edge matched or no edges present, snap to closest node
  if (!closestPoint) {
    for (const node of nodes) {
      const dist = Math.sqrt((px - node.x) ** 2 + (py - node.y) ** 2);
      if (dist < minDistance) {
        minDistance = dist;
        closestPoint = { x: node.x, y: node.y };
      }
    }
  }

  return {
    x: closestPoint ? closestPoint.x : px,
    y: closestPoint ? closestPoint.y : py,
    edge: matchedEdge,
    distance: minDistance
  };
}

export class PositionTracker {
  constructor(options = {}) {
    this.stepLengthMeters = options.stepLengthMeters || 0.7; // ~0.7m default
    this.pixelsPerMeter = options.pixelsPerMeter || 35; // Map scale
    this.debounceMs = options.debounceMs || 300; // Min time between steps
    this.stepThreshold = options.stepThreshold || 1.4; // Acceleration peak threshold in m/s^2
    this.compassPullFactor = options.compassPullFactor || 0.01; // ~1% compass correction

    // Graph data for snapping
    this.nodes = options.nodes || [];
    this.edges = options.edges || [];

    // State
    this.rawPosition = { x: 0, y: 0 };
    this.snappedPosition = { x: 0, y: 0 };
    this.heading = 0; // Fused heading in degrees [0, 360) clockwise from North
    this.compassHeading = 0;
    this.stepCount = 0;
    this.isTracking = false;
    this.hasInitialPosition = false;

    // Internal sensor fusion state
    this.lastStepTime = 0;
    this.lastMotionTime = null;
    this.lastMag = 0;
    this.isPeak = false;

    // Listeners
    this.listeners = new Set();

    // Bound event handlers
    this.handleDeviceMotion = this.handleDeviceMotion.bind(this);
    this.handleDeviceOrientation = this.handleDeviceOrientation.bind(this);
  }

  /**
   * Check if running on iOS where permissions require explicit user gesture
   */
  static isPermissionNeeded() {
    return (
      typeof window !== 'undefined' &&
      typeof window.DeviceMotionEvent !== 'undefined' &&
      typeof window.DeviceMotionEvent.requestPermission === 'function'
    );
  }

  /**
   * Request device motion and orientation permissions (required on iOS 13+)
   */
  static async requestPermission() {
    if (!PositionTracker.isPermissionNeeded()) {
      return { granted: true };
    }

    try {
      let motionGranted = false;
      let orientationGranted = false;

      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        const res = await window.DeviceMotionEvent.requestPermission();
        motionGranted = res === 'granted';
      } else {
        motionGranted = true;
      }

      if (
        typeof window.DeviceOrientationEvent !== 'undefined' &&
        typeof window.DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const res = await window.DeviceOrientationEvent.requestPermission();
        orientationGranted = res === 'granted';
      } else {
        orientationGranted = true;
      }

      return {
        granted: motionGranted && orientationGranted,
        motionGranted,
        orientationGranted
      };
    } catch (err) {
      console.warn('Motion permission request failed or rejected:', err);
      return { granted: false, error: err };
    }
  }

  /**
   * Set or update corridor graph nodes & edges
   */
  updateGraph(nodes = [], edges = []) {
    this.nodes = nodes;
    this.edges = edges;
  }

  /**
   * Set pixels-per-meter scale factor
   */
  setPixelsPerMeter(ppm) {
    if (ppm && ppm > 0) {
      this.pixelsPerMeter = ppm;
    }
  }

  /**
   * Set step length in meters
   */
  setStepLength(meters) {
    if (meters && meters > 0) {
      this.stepLengthMeters = meters;
    }
  }

  /**
   * Silent re-anchoring: Set exact coordinates (e.g. from a QR scan),
   * resetting step-based drift without visual jump.
   */
  reanchor(x, y) {
    this.rawPosition = { x, y };
    this.snappedPosition = { x, y };
    this.hasInitialPosition = true;
    this.notifyUpdate();
  }

  /**
   * Subscribe to position & heading updates
   * callback receives { x, y, rawX, rawY, heading, stepCount }
   */
  onUpdate(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyUpdate() {
    const payload = {
      x: this.snappedPosition.x,
      y: this.snappedPosition.y,
      rawX: this.rawPosition.x,
      rawY: this.rawPosition.y,
      heading: this.heading,
      compassHeading: this.compassHeading,
      stepCount: this.stepCount
    };
    for (const cb of this.listeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('Error in position listener:', err);
      }
    }
  }

  /**
   * Start listening to device motion & orientation
   */
  start() {
    if (this.isTracking || typeof window === 'undefined') return;

    this.lastMotionTime = performance.now();
    window.addEventListener('devicemotion', this.handleDeviceMotion, true);

    // Some Android devices fire deviceorientationabsolute for true North
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', this.handleDeviceOrientation, true);
    } else {
      window.addEventListener('deviceorientation', this.handleDeviceOrientation, true);
    }

    this.isTracking = true;
  }

  /**
   * Stop listening
   */
  stop() {
    if (!this.isTracking || typeof window === 'undefined') return;

    window.removeEventListener('devicemotion', this.handleDeviceMotion, true);
    window.removeEventListener('deviceorientationabsolute', this.handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation, true);

    this.isTracking = false;
    this.lastMotionTime = null;
  }

  /**
   * Handle DeviceOrientation event for compass heading
   */
  handleDeviceOrientation(event) {
    let compass = null;

    if (typeof event.webkitCompassHeading !== 'undefined' && event.webkitCompassHeading !== null) {
      // iOS Safari provides webkitCompassHeading (0 = North, 90 = East, etc.)
      compass = event.webkitCompassHeading;
    } else if (event.alpha !== null && typeof event.alpha !== 'undefined') {
      // Android / standard W3C
      // In standard deviceorientation, alpha is rotation around Z axis [0, 360).
      // Compass heading is typically (360 - alpha) % 360
      compass = (360 - event.alpha) % 360;
    }

    if (compass !== null && !isNaN(compass)) {
      this.compassHeading = compass;

      // If heading hasn't been initialized, lock to compass immediately
      if (this.lastMotionTime === null) {
        this.heading = compass;
      } else {
        // Pull fused heading ~1% toward compass reading each update
        // Using circular difference to handle 359 -> 1 wrap
        const diff = ((compass - this.heading + 540) % 360) - 180;
        this.heading = (this.heading + diff * this.compassPullFactor + 360) % 360;
      }
    }
  }

  /**
   * Handle DeviceMotion event for step detection and gyro yaw integration
   */
  handleDeviceMotion(event) {
    const now = performance.now();
    const dt = this.lastMotionTime ? (now - this.lastMotionTime) / 1000 : 0.02; // seconds
    this.lastMotionTime = now;

    // 1. Gyroscope Yaw Integration
    const rate = event.rotationRate;
    if (rate && typeof rate.alpha === 'number' && !isNaN(rate.alpha)) {
      // rate.alpha is rotation rate around Z axis in deg/s
      const yawRate = rate.alpha;
      this.heading = (this.heading - yawRate * dt + 360) % 360;
    }

    // 2. Linear Acceleration Step Detection
    // Use event.acceleration (without gravity), fall back to accelerationIncludingGravity
    const acc = event.acceleration && (event.acceleration.x !== null || event.acceleration.y !== null)
      ? event.acceleration
      : event.accelerationIncludingGravity;

    if (!acc) return;

    const ax = acc.x || 0;
    const ay = acc.y || 0;
    const az = acc.z || 0;
    let mag = Math.sqrt(ax * ax + ay * ay + az * az);

    // If using accelerationIncludingGravity, subtract earth gravity (~9.8 m/s^2)
    if (!event.acceleration || (event.acceleration.x === null && event.acceleration.y === null)) {
      mag = Math.abs(mag - 9.80665);
    }

    // Peak detection with debounce
    const timeSinceLastStep = now - this.lastStepTime;
    if (mag > this.stepThreshold && mag > this.lastMag) {
      this.isPeak = true;
    } else if (this.isPeak && mag < this.lastMag) {
      // Local peak confirmed
      this.isPeak = false;
      if (timeSinceLastStep >= this.debounceMs) {
        this.recordStep(now);
      }
    }
    this.lastMag = mag;
  }

  /**
   * Execute a single step in the direction of fused heading
   */
  recordStep(timestamp = performance.now()) {
    this.lastStepTime = timestamp;
    this.stepCount += 1;

    if (!this.hasInitialPosition) {
      // No anchor yet, do not project coordinates
      this.notifyUpdate();
      return;
    }

    // Step distance in pixels
    const stepPx = this.stepLengthMeters * this.pixelsPerMeter;

    // Fused heading: 0° = North (-Y), 90° = East (+X), 180° = South (+Y), 270° = West (-X)
    const rad = (this.heading * Math.PI) / 180;
    const dx = Math.sin(rad) * stepPx;
    const dy = -Math.cos(rad) * stepPx;

    // Advance raw position
    this.rawPosition = {
      x: this.rawPosition.x + dx,
      y: this.rawPosition.y + dy
    };

    // Snap to nearest edge in corridor graph
    const snapped = snapToCorridorGraph(
      this.rawPosition.x,
      this.rawPosition.y,
      this.nodes,
      this.edges
    );

    this.snappedPosition = {
      x: snapped.x,
      y: snapped.y
    };

    this.notifyUpdate();
  }

  /**
   * Step Simulator for Desktop / Manual Testing
   * Simulates a step forward in the current heading (or custom angle)
   */
  simulateStep(headingOverride = null) {
    if (headingOverride !== null) {
      this.heading = (headingOverride + 360) % 360;
    }
    this.recordStep();
  }

  /**
   * Rotate simulator heading
   */
  simulateTurn(deltaDegrees) {
    this.heading = (this.heading + deltaDegrees + 360) % 360;
    this.notifyUpdate();
  }
}
