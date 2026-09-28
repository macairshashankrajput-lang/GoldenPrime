# Manager Operations Validation

The authenticated Owner/Manager workspace was inspected after the building and room-management update. The Buildings screen displays the existing Golden Stay and Golden Prime PG cards, the New building action, and share, edit, and delete controls on each property card. The Rooms screen displays building selection, Add floor, Edit room, and Add room actions, with an empty-state explanation when no floors or rooms exist.

The delete paths are intentionally conservative. An empty building can be deleted, while any building with floors, rooms, tenants, billing, electricity, expenses, or reminders is blocked with a conflict message. A room with tenant allocations or electricity history is protected, and a floor with assigned rooms is protected. Manager access remains allowed by the existing full operational permission matrix; tenant access remains denied.
