# Reauditoría — Páginas legales v2 y operación

Fecha: 2026-10-16. Alcance: solicitud v2, diff contra `39457f2`, archivos actuales y `OPERACION-HAG-Supply.md`. La solicitud limita este GO al despliegue con Stripe en modo test.

**GO técnico condicionado para publicar en modo test: resolver antes la afirmación sobre respaldos cifrados y su retención.** El resto de las correcciones revisadas resulta aceptable para ese alcance. No se certifica cumplimiento legal ni habilitación de cobros reales.

## 1. Condición pendiente — respaldo de una afirmación nueva de Privacy

`app/(store)/privacy/page.tsx:76–77` afirma que los datos eliminados permanecen temporalmente en respaldos **cifrados** hasta ser reemplazados.

La evidencia del repositorio no permite verificarlo para todas las copias:

- `scripts/backup-db.ts:36–43` exporta los registros a archivos JSON mediante `writeFileSync`, sin cifrado de archivo propio.
- La carpeta predeterminada contiene la fecha. Una ejecución en una fecha posterior crea otra carpeta; el script no rota ni elimina las anteriores.
- `OPERACION-HAG-Supply.md:45` remite a una “próxima limpieza”, sin plazo, frecuencia o tratamiento concreto de copias locales.

Esto **no demuestra que el volumen o el almacenamiento externo estén sin cifrar**: esa configuración no se inspeccionó. Se solicitó al dueño confirmar cifrado y plazo de eliminación; no se da por existente una medida que no está documentada o verificada.

**Para levantar la condición:** acreditar y documentar qué protege cada copia, incluida la exportación local, y su plazo/proceso de eliminación; o ajustar el texto público para describir únicamente las medidas reales verificadas. No atribuir automáticamente a los JSON locales las garantías del backup administrado de Supabase.

El modo test de Stripe no vuelve ficticios los datos de las cuentas y mensajes que se creen en el sitio. Por eso esta precisión afecta a la publicación de Privacidad, aunque todavía no se cobre dinero real. La FTC recomienda inventariar todas las copias y definir por escrito protección, retención y eliminación. [Guía oficial](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business).

## 2. Correcciones aceptadas para modo test

- **Ubicación:** Delray Beach, FL 33484, USA aparece como ubicación de la empresa; no se presenta como dirección postal completa. La sección postal sigue oculta mientras `mailingAddress` sea null. Conforme al alcance v2, obtener la dirección comercial se traslada a los requisitos previos a live.
- **Retrasos:** Shipping incorpora aviso antes del vencimiento del plazo, fecha revisada y opción de cancelación/reembolso. El manual asigna responsable y conserva el registro del aviso.
- **Cancelaciones:** se explicita el plazo de emisión de dos días hábiles y se reconoce la limitación del refund manual sin actualización del pedido. La acción admin completa queda pendiente antes de live, sin presentarla como funcionalidad ya disponible.
- **Devoluciones:** se distingue el plazo de emisión tras aprobación del plazo bancario, y la ventana de siete días preserva los derechos legales aplicables.
- **Emails:** la confirmación elimina la promesa de aviso de despacho que no existe. Consulta de estado en la cuenta coincide con la operación actual.
- **Privacidad:** se añaden Cloudflare/Gmail, solicitudes por email, responsable y plazo de respuesta. La observación sobre respaldos queda separada arriba.
- **Cobertura:** Washington, D.C. queda incluido y coincide con checkout.
- **Constantes:** los nuevos plazos están concentrados en `STORE_INFO`. Envío gratis continúa escrito directamente en las páginas/footer, con esa decisión reconocida en la solicitud.

## 3. Manual: precisiones antes de live

Estas observaciones no bloquean el despliegue test una vez resuelta la condición anterior, pero el manual no debe considerarse cerrado para operación real:

1. **Retrasos sin respuesta o reiterados.** La sección 2 no define cómo obtener y registrar consentimiento, qué ocurre si el cliente no contesta o si se vuelve a incumplir la fecha revisada. Añadir esas decisiones antes de live. La guía de la FTC distingue esos supuestos; enviar un aviso no equivale siempre a obtener consentimiento. [Guía oficial de cumplimiento](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule).
2. **Estado elegible para cancelar.** Comprobar solo que no sea `SHIPPED` admite también `DELIVERED` o una orden ya reembolsada. El procedimiento definitivo debe aceptar explícitamente estados pagados no despachados y verificar que no exista refund anterior. Asimismo, crear un refund no demuestra por sí solo que concluyó: el registro y el mensaje al cliente deben distinguir pendiente, completado y fallido.
3. **Borrado conservando pedidos.** `Order.userId` es obligatorio y relaciona la orden con User; borrar directamente User mientras se conservan sus órdenes no es el procedimiento definido por el schema. Documentar cierre/desactivación y anonimización selectiva o una solución de datos compatible con las obligaciones de conservación. Incluir copias de datos en EmailOutbox y buzones; no ordenar un borrado destructivo genérico.
4. **Verificación de identidad.** Recibir un correo con el mismo remitente declarado no prueba por sí solo control de la cuenta. Para entregar o borrar datos, definir comprobación de control del buzón/cuenta y una alternativa para quien perdió acceso. No hace falta recopilar documentos personales indiscriminadamente.
5. **Inspección de devoluciones.** Se fija la emisión del refund tras aprobar, pero no el plazo para inspeccionar y resolver. Definirlo operativamente para evitar que la aprobación quede indefinidamente pendiente.

La revisión legal de Terms/Privacy, sales tax, dirección de devolución, cancelación y refund integrados y configuración Stripe live siguen pendientes conforme a la solicitud. La lista de requisitos de este documento complementa los anteriores; no los sustituye.

## 4. Evidencia y límites

- `npx tsc --noEmit --incremental false`: **OK**.
- Se contrastaron los textos y el manual con schema, script de backup, plantillas y flujo de pedidos. Se consultaron las fuentes oficiales citadas y la guía local de metadata de Next.js.
- Build y revisión visual previa son evidencia aportada. No se reejecutaron en navegador ni se verificó visualmente la línea bajo Pay en esta ronda.
- No se accedió a backups ni a datos personales para esta revisión; se leyó el código del exportador. No se verificó cifrado de disco, rotación externa, permisos del buzón ni ejecución real de los procedimientos.

Solo se agregó este informe. No se modificó código funcional ni el manual, no se borraron datos, no se enviaron mensajes y no se desplegó.
