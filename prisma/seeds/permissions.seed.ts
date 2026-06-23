// Matriz de permisos — Anexo 12.1 del plan de arquitectura
export const PERMISSIONS = [
  // Mesas
  { code: 'VIEW_TABLES', description: 'View tables and their status' },
  {
    code: 'MANAGE_TABLE_STATUS',
    description: 'Change table status (free/occupied/bill_requested)',
  },
  // Menú
  { code: 'VIEW_MENU', description: 'View menu items and categories' },
  {
    code: 'MANAGE_MENU_ITEMS',
    description: 'Create, update, delete menu items',
  },
  { code: 'MANAGE_RECIPES', description: 'Define and update recipes (BOM)' },
  // Órdenes
  { code: 'CREATE_ORDER', description: 'Create new orders' },
  { code: 'ADD_ORDER_ITEM', description: 'Add items to an existing order' },
  {
    code: 'CHANGE_ORDER_STATUS',
    description: 'Mark order as in_kitchen / ready',
  },
  // Cobro
  {
    code: 'COLLECT_PAYMENT',
    description: 'Close an order and collect payment',
  },
  // Descuentos
  {
    code: 'APPLY_DISCOUNT',
    description: 'Apply discounts or promotions to an order',
  },
  {
    code: 'MANAGE_PROMOTIONS',
    description: 'Create and manage promotion definitions',
  },
  // Costos y reportes
  {
    code: 'VIEW_RECIPE_COST',
    description: 'View cost and margin per menu item',
  },
  {
    code: 'VIEW_PROFITABILITY_REPORTS',
    description: 'View profitability and food cost reports',
  },
  {
    code: 'VIEW_FINANCIAL_REPORTS',
    description: 'View financial and cash session reports',
  },
  // Inventario
  {
    code: 'MANAGE_INGREDIENTS',
    description: 'Create and update ingredients catalog',
  },
  {
    code: 'ADJUST_INVENTORY',
    description: 'Register waste and manual inventory adjustments',
  },
  // Compras
  { code: 'MANAGE_SUPPLIERS', description: 'Create and manage suppliers' },
  {
    code: 'MANAGE_PURCHASE_ORDERS',
    description: 'Create, send and receive purchase orders',
  },
  // Caja
  { code: 'OPEN_CASH_SESSION', description: 'Open a cash register session' },
  {
    code: 'REGISTER_CASH_MOVEMENT',
    description: 'Register cash movements (payin/payout)',
  },
  { code: 'CLOSE_CASH_SESSION', description: 'Close a cash register session' },
  // Clientes
  {
    code: 'MANAGE_CUSTOMERS',
    description: 'Create and manage customer profiles',
  },
  {
    code: 'MANAGE_RESERVATIONS',
    description: 'Create and manage reservations',
  },
  // Usuarios
  { code: 'MANAGE_USERS', description: 'Create, update and deactivate users' },
  { code: 'MANAGE_ROLES', description: 'View roles and permissions' },
  // Auditoría
  { code: 'VIEW_AUDIT_LOG', description: 'View audit trail' },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

// Role → permissions mapping (Anexo 12.1)
export const ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  Mesero: [
    'VIEW_TABLES',
    'MANAGE_TABLE_STATUS',
    'VIEW_MENU',
    'CREATE_ORDER',
    'ADD_ORDER_ITEM',
    'MANAGE_CUSTOMERS',
    'MANAGE_RESERVATIONS',
  ],
  Cajero: [
    'VIEW_TABLES',
    'MANAGE_TABLE_STATUS',
    'VIEW_MENU',
    'CREATE_ORDER',
    'ADD_ORDER_ITEM',
    'COLLECT_PAYMENT',
    'OPEN_CASH_SESSION',
    'REGISTER_CASH_MOVEMENT',
    'CLOSE_CASH_SESSION',
  ],
  Cocina: ['VIEW_MENU', 'CHANGE_ORDER_STATUS'],
  Admin: PERMISSIONS.map((p) => p.code),
};
