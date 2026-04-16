## 1. API

- [x] 1.1 Add `DELETE /:id` route to `apps/api/src/routes/improvements.ts` that soft-deletes the improvement document and returns 200

## 2. Frontend — Sidebar

- [x] 2.1 Add a trash icon (visible on hover) to each improvement row in the sidebar, matching the conversation row delete pattern
- [x] 2.2 Wire the trash icon to call `DELETE /improvements/:id` and invalidate the `improvements` query
- [x] 2.3 If the deleted improvement is currently active, navigate away (e.g. to the first remaining improvement or the models root)

## 3. Frontend — Detail Page

- [x] 3.1 Add a delete button (trash icon or "Delete" action) to the improvement detail page header
- [x] 3.2 Wire it to call the same delete endpoint, invalidate queries, and navigate away after deletion
