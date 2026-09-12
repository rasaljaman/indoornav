import ElementPropertiesPanel from './ElementPropertiesPanel';

export default function RoomPropertiesPanel({ room, onUpdate, onDelete, onClose }) {
  if (!room) return null;
  return (
    <ElementPropertiesPanel
      selection={{ type: 'room', id: room.id, ids: new Set([room.id]) }}
      rooms={[room]}
      nodes={[]}
      edges={[]}
      qrPoints={[]}
      onUpdateRoom={onUpdate}
      onDeleteRoom={onDelete}
      onClose={onClose}
    />
  );
}
