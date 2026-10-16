# Operación — HAG Supply (procedimientos que respaldan las políticas publicadas)

Responsable de todo lo que sigue: el dueño (hagpartnerllc@gmail.com). Los emails de clientes llegan a orders@hagpartner.com (Cloudflare Email Routing → Gmail).

## 1. Revisión diaria de pedidos (días hábiles)

- Abrir **Admin → Orders**. Todo pedido en `PAYMENT_CONFIRMED` o `PROCESSING` debe despacharse dentro de **1–2 días hábiles** desde el pago.
- Al despachar: marcar `SHIPPED`. El cliente ve el estado en su cuenta; hoy no recibe email de despacho.
- Revisar también **Admin → Emails** y la tarjeta del dashboard (emails fallidos o atrasados).

## 2. Retraso de despacho (Shipping → "If we can't ship on time")

1. Si un pedido no saldrá dentro del plazo, escribir al cliente **antes de que termine el plazo**, con la nueva fecha estimada y la opción de cancelar con reembolso total.
2. Si el cliente cancela, o si no se podrá despachar: seguir la sección 3.
3. Guardar el email enviado (Gmail) como registro.

## 3. Cancelación antes del envío (Returns → "Order cancellations")

Plazo prometido: confirmar por email y reembolsar en **2 días hábiles**.

**Mientras no exista "Cancelar y reembolsar" en el admin** (pendiente antes de live):

1. Confirmar que el pedido **no** está en `SHIPPED`. Si lo está, no se puede cancelar: aplica la devolución.
2. Separar el pedido para que no se despache.
3. En el dashboard de Stripe: Payments → el pago del pedido → **Refund** por el total.
4. Responder al cliente confirmando la cancelación y el reembolso.
5. **Limitación actual:** un reembolso hecho a mano en Stripe no cambia el estado del pedido en la tienda. El pedido sigue en `PAYMENT_CONFIRMED` y el stock no vuelve solo. Por eso, **antes de cobros reales**, debe existir la acción de admin que cancele, reembolse, devuelva el stock y deje registro.

## 4. Corrección de dirección

Solo antes del despacho. Responder confirmando la dirección nueva y usarla en la etiqueta de envío. Dejar constancia en el hilo de email del pedido.

## 5. Devoluciones (Returns)

1. El cliente escribe primero. Responder con instrucciones y la dirección de devolución. Hoy esa dirección se da por email; la web no publica una dirección postal.
2. Al recibir: inspeccionar y escribir aprobando o rechazando.
3. Si se aprueba: reembolsar en Stripe dentro de **3 días hábiles** desde la aprobación (luego el banco tarda 5–10 días hábiles).
4. Productos dañados, defectuosos o equivocados: la tienda paga el envío de vuelta, o pide al cliente quedárselo o desecharlo. Reemplazo o reembolso, a elección del cliente.

## 6. Pedidos de privacidad (Privacy → "Your choices and rights")

1. Aceptar solo pedidos que vengan del email de la cuenta (así se verifica la identidad). Si no, pedir que escriban desde ese email.
2. Responder en **30 días**.
3. Acceso o corrección: enviar o corregir los datos de la cuenta y los pedidos.
4. Borrado o cierre de cuenta: borrar la cuenta y sus datos personales. Conservar los registros de pedidos que exijan contabilidad o impuestos, y decírselo al cliente. Borrar los emails relacionados en Gmail que ya no se necesiten. Las copias en la bandeja `EmailOutbox` y en los respaldos desaparecen con la limpieza de la sección 7.
5. Guardar el hilo de email como registro de la solicitud y la respuesta.

## 7. Respaldos (Privacy → "How long we keep it")

- `scripts/backup-db.ts` exporta la base a JSON **sin cifrar** en `backups/<fecha>/`, en la computadora del dueño. La carpeta está en `.gitignore` y nunca se sube a GitHub. No copiarla a servicios en la nube ni a USB sin cifrar.
- **El día 1 de cada mes:** borrar las carpetas de `backups/` con más de **90 días**, sin excepciones. Si hace falta conservar un respaldo para un rollback, se conserva solo mientras dure ese rollback y siempre dentro de los 90 días.
- Respaldos administrados de Supabase: los gestiona el proveedor y vencen según su plan. No se descargan.
- La política pública promete exactamente esto ("within 90 days"). Si cambia el proceso, hay que cambiar el texto.

## 8. Precisiones del manual antes de live (veredicto v2, §3)

1. **Retrasos:** cómo se registra el consentimiento del cliente para esperar, qué pasa si no contesta (cancelar y reembolsar) y qué pasa si se incumple también la fecha revisada.
2. **Cancelación:** solo se cancelan pedidos pagados y no despachados (`PAYMENT_CONFIRMED` / `PROCESSING`) y sin refund previo. El registro distingue refund pendiente, completado y fallido.
3. **Borrado de cuenta:** `Order.userId` es obligatorio. Se desactiva la cuenta y se anonimizan los datos personales, en vez de borrar el usuario, cuando haya pedidos que conservar. Incluye las copias en `EmailOutbox` y en Gmail.
4. **Verificación de identidad:** confirmar el control del buzón (por ejemplo, con un código enviado al email de la cuenta) antes de entregar o borrar datos. Definir una alternativa para quien perdió el acceso.
5. **Inspección de devoluciones:** fijar un plazo para inspeccionar y resolver desde la recepción (por ejemplo, 3 días hábiles).

## 9. Pendiente antes de cobros reales

- Acción de admin **Cancelar y reembolsar**, más el **email de despacho** opcional.
- Dirección postal comercial (PO Box o buzón) para devoluciones, y decidir si se publica.
- Que contador o abogado revise Terms y Privacy, y confirme la obligación de sales tax.
- Activar Stripe live, claves live y un webhook live con su propio secreto.
