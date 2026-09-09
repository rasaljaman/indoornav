# Row Level Security (RLS) Policy Documentation

This document outlines the security policies enforced across all public database tables in the IndoorNav system. Every table has Row Level Security enabled (`ENABLE ROW LEVEL SECURITY`).

---

## 1. User Roles & Identity Functions

The system identifies callers using Supabase authentication and database helper functions:
- **`auth.uid()`**: Returns the authenticated user's Supabase Auth ID.
- **`get_user_role()`**: Queries the `admins` table for the authenticated user and returns their role (`super_admin` or `org_admin`).
- **`get_user_org_id()`**: Queries the `admins` table for the authenticated user and returns their assigned `org_id`.
- **`anon` (Unauthenticated Visitor)**: A visitor scanning QR codes or accessing the public navigation view without logging in.

---

## 2. Table-by-Table Policy Summary

### `organizations`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `orgs_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable so visitors can resolve campus info by slug. |
| `orgs_super_admin_all` | `super_admin` | `ALL` | Full management (create, update, delete any organization). |
| `orgs_org_admin_update` | `org_admin` | `UPDATE` | Org admins can only update their own organization row (`id = get_user_org_id()`). |

### `admins`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `admins_self_read` | Authenticated | `SELECT` | Admins can only view their own profile (`auth_id = auth.uid()`). |
| `admins_super_admin_all` | `super_admin` | `ALL` | Full control to invite, assign, and manage admin users across all organizations. |
| *Anonymous / Visitors* | `anon` | **None** | Anonymous visitors have **zero access** (cannot read, insert, update, or delete). |

### `buildings`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `buildings_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable for visitors navigating campuses. |
| `buildings_org_admin_all` | `org_admin` | `ALL` | Org admins can only create, edit, and delete buildings where `org_id = get_user_org_id()`. |
| `buildings_super_admin_all` | `super_admin` | `ALL` | Full access to manage buildings across all organizations. |

### `floors`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `floors_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable for visitors viewing floor plans. |
| `floors_org_admin_all` | `org_admin` | `ALL` | Org admins can only manage floors belonging to their organization's buildings. |
| `floors_super_admin_all` | `super_admin` | `ALL` | Global access across all floors. |

### `rooms`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `rooms_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable for visitor room search and directory lookup. |
| `rooms_org_admin_all` | `org_admin` | `ALL` | Org admins can only create, edit, or delete rooms belonging to their organization's floors. |
| `rooms_super_admin_all` | `super_admin` | `ALL` | Global access across all rooms. |

### `nodes`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `nodes_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable for pathfinding graph and navigation. |
| `nodes_org_admin_all` | `org_admin` | `ALL` | Org admins can only create, edit, or delete nodes on floors belonging to their organization. |
| `nodes_super_admin_all` | `super_admin` | `ALL` | Global access across all navigation nodes. |

### `edges`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `edges_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable for shortest path routing (A* algorithm). |
| `edges_org_admin_all` | `org_admin` | `ALL` | Org admins can only manage edges connecting nodes within their organization. |
| `edges_super_admin_all` | `super_admin` | `ALL` | Global access across all corridor edges. |

### `floor_connectors`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `connectors_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable for stairs, elevators, and ramps connecting floors. |
| `connectors_org_admin_all` | `org_admin` | `ALL` | Org admins can only manage connectors linking nodes in their organization. |
| `connectors_super_admin_all` | `super_admin` | `ALL` | Global access across all floor connectors. |

### `qr_points`
| Policy Name | Permitted Roles | Actions | Rule / Filter |
|---|---|---|---|
| `qr_public_read` | All (`anon` & authenticated) | `SELECT` | Publicly readable so scanned QR codes can resolve physical coordinates. |
| `qr_org_admin_all` | `org_admin` | `ALL` | Org admins can only generate, update, or remove QR points for nodes in their organization. |
| `qr_super_admin_all` | `super_admin` | `ALL` | Global access across all QR points. |

---

## 3. Cross-Tenant Isolation Enforcement

1. **No Data Leakage Between Organizations**:
   Every mutation (INSERT, UPDATE, DELETE) by an `org_admin` is scoped by `get_user_org_id()`. An admin belonging to Organization A attempting to read or mutate records belonging to Organization B is automatically rejected by PostgreSQL at the database engine level.

2. **Zero Admin Exposure to Visitors**:
   The `admins` table has no policies granted to `anon`. Unauthenticated visitors attempting `supabase.from('admins').select('*')` receive an empty result set `[]`.
