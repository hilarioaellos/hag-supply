-- HAG-123: aviso al dueño por cada venta nueva (aditiva).
ALTER TYPE "EmailKind" ADD VALUE IF NOT EXISTS 'ADMIN_NEW_ORDER';
