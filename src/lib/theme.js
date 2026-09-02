/**
 * Room category → color palette
 * Used by both the admin map editor and the visitor Leaflet map
 * for consistent color-coded room rendering.
 */

export const CATEGORY_COLORS = {
  lab: '#3B82F6',        // blue
  office: '#6B7280',     // grey
  washroom: '#06B6D4',   // cyan
  department: '#10B981', // green
  stairs: '#F97316',     // orange
  lift: '#8B5CF6',       // purple
  entrance: '#EF4444',   // red
  other: '#A3A3A3',      // neutral
};

/**
 * Get the display color for a room.
 * If the room has a custom color override, use that.
 * Otherwise, fall back to the category default.
 */
export function getRoomColor(room) {
  if (room.color) return room.color;
  return CATEGORY_COLORS[room.category] || CATEGORY_COLORS.other;
}

/**
 * Category display labels for the map legend.
 */
export const CATEGORY_LABELS = {
  lab: 'Lab',
  office: 'Office',
  washroom: 'Washroom',
  department: 'Department',
  stairs: 'Stairs',
  lift: 'Lift / Elevator',
  entrance: 'Entrance',
  other: 'Other',
};
