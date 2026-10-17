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

1. Abrir el pedido en **Admin → Orders**. El botón **"Cancel & refund"** solo aparece si el pedido está pagado y no despachado (`PAYMENT_CONFIRMED` o `PROCESSING`). Si ya está `SHIPPED`, no se puede cancelar: aplica la devolución.
2. Pulsar **"Cancel & refund"**, confirmar y anotar el motivo. Con eso:
   - el pedido queda cancelado (no se despacha),
   - el stock vuelve al inventario,
   - se reembolsa el total en Stripe,
   - el cliente recibe el email "Order cancelled",
   - y queda registrado quién canceló, cuándo y por qué.
3. Resultado:
   - **"Refunded"**: listo.
   - **"Cancelled — Refund Pending"**: Stripe todavía lo procesa, o hubo un error de conexión. Pulsar **"Retry refund"**; si Stripe ya lo creó, lo concluye solo el webhook. Si el proceso se cortó antes de crearlo, **nadie lo reintenta solo**: a los 30 minutos el pedido aparece en la tarjeta roja del dashboard ("Orders with Refund Problems") y hay que pulsar "Retry refund".
   - **"Cancelled — Refund Failed"**: llega un aviso por email. Reembolsar el total a mano en el dashboard de Stripe (Payments → el pago → Refund). Luego, en el pedido, pegar el ID del refund (`re_…`) en **"Mark refunded"**. La tienda lo verifica en Stripe (mismo pago, `succeeded`, monto completo), pasa el pedido a "Refunded", deja la nota de quién lo registró y manda al cliente el email "Refund issued". Hasta entonces el pedido sigue en la tarjeta roja.
3b. **Emails al cliente:** "Order cancelled" sale al cancelar y dice que el reembolso está en gestión. "Refund issued" sale **solo** cuando Stripe confirma el reembolso, o al registrar el refund manual verificado. Si la confirmación del pedido aún no había salido, se anula y no se envía.
4. **No reembolsar a mano en Stripe** un pedido que no se canceló con el botón: la tienda no se entera (el pedido seguiría "pagado" y el stock no vuelve).

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

- ~~Acción de admin Cancelar y reembolsar~~ (hecha). Pendiente opcional: **email de despacho**.
- Dirección postal comercial (PO Box o buzón) para devoluciones, y decidir si se publica.
- Que contador o abogado revise Terms y Privacy, y confirme la obligación de sales tax.
- Activar Stripe live, claves live y un webhook live con su propio secreto.
