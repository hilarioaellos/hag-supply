# PRD — HAG Supply (Tienda en Línea, MVP)

**Versión:** 1.0
**Fecha:** 14 de julio de 2026
**Autor:** Hilario Aellos
**Estado:** Borrador para construcción con Claude Code

---

## 1. Resumen ejecutivo

HAG Supply es una tienda en línea de catálogo propio (un solo vendedor, sin marketplace) que vende productos para el hogar organizados por categorías: despensa/abarrotes, limpieza, decoración, herramientas y jardín/patio. El diseño visual principal ya está construido (`HAG Supply Homepage.dc.html`) y sirve como referencia de marca, layout y tono visual para todo el sitio.

Este documento define el alcance del **MVP**: la versión mínima que permite operar la tienda de punta a punta (navegar, comprar, pagar, administrar pedidos) antes de invertir en funcionalidades avanzadas.

## 2. Problema y objetivo

**Problema:** no existe hoy una tienda en línea operativa para HAG Supply; las ventas (si existen) dependen de canales manuales o no digitales.

**Objetivo del MVP:** lanzar una tienda funcional donde un cliente pueda encontrar un producto por categoría o búsqueda, agregarlo al carrito, pagar con tarjeta y recibir su pedido — y donde el dueño del negocio pueda cargar productos, gestionar stock manualmente y ver los pedidos entrantes, sin depender de un equipo técnico externo.

## 3. Usuario objetivo

- **Comprador final:** persona que compra productos de uso doméstico general (limpieza, despensa, herramientas, jardín, decoración) para su hogar, en un solo mercado local, pagando en USD.
- **Administrador (dueño/operador):** Hilario u otra persona designada, que carga productos, ajusta stock manualmente y revisa pedidos desde un panel de administración.

*(No hay un tercer tipo de usuario tipo "vendedor externo" — el modelo es catálogo propio, no marketplace.)*

## 4. Alcance del MVP

### Dentro de alcance
- Catálogo de productos organizado en categorías (basado en las 5 categorías del diseño: Pantry & Grocery, Cleaning Supplies, Home & Décor, Tools & Hardware, Patio & Garden) más una sección promocional de Ofertas/Deals.
- Cuentas de usuario (registro, login, historial de pedidos).
- Buscador de productos y filtros por categoría (mínimo; precio/disponibilidad si el tiempo lo permite).
- Carrito de compras y checkout.
- Pago con tarjeta vía pasarela tipo Stripe (mercado local, USD únicamente).
- Panel de administración para: alta/edición de productos, categorías, ajuste manual de stock, y visualización/gestión de pedidos.
- Envío gestionado por logística propia (no integración con courier externo en el MVP).
- Diseño responsive basado en el layout ya definido (`HAG Supply Homepage.dc.html`).

### Explícitamente fuera de alcance (Fase 2+)
- **Checkout como invitado** (sin necesidad de crear cuenta). En el MVP/fase de prueba el registro es obligatorio; habilitar compra como invitado queda planificado para cuando se salga de la fase de prueba.
- Multi-idioma y multi-moneda (el diseño está en inglés/USD; visión futura de expansión, no en MVP).
- Integración con courier o proveedor de envíos externo.
- Sistema de reseñas y calificaciones de productos con contenido real de usuarios (el diseño muestra estrellas y conteos, pero como elemento visual — ver sección 9, "Decisión pendiente").
- Lista de favoritos/wishlist funcional (aparece en el diseño como ícono, ver sección 9).
- Marketplace multi-vendedor o dropshipping.
- Automatización de inventario o integración con proveedores/ERP.
- Newsletter con envío automatizado real (el formulario puede existir visualmente, el envío de campañas queda fuera del MVP).
- Programas de descuentos avanzados, cupones, o motor de recomendaciones.

## 5. Funcionalidades del MVP (detalle)

### 5.1 Catálogo y navegación
- Home con: hero principal, grid de categorías, sección de productos destacados, sección de beneficios (envío rápido, checkout seguro, etc.), bloque promocional.
- Página de categoría con listado de productos y filtros básicos.
- Página de producto individual con imagen, nombre, precio, descripción y botón "Agregar al carrito".
- Navegación superior con las categorías reales del catálogo (reflejando el diseño: Pantry & Grocery, Cleaning Supplies, Home & Décor, Tools & Hardware, Patio & Garden, Deals & Offers).

### 5.2 Cuentas de usuario
- Registro e inicio de sesión (email + contraseña, mínimo).
- Perfil básico: datos de contacto y dirección de envío.
- Historial de pedidos del usuario.

### 5.3 Buscador y filtros
- Buscador de texto libre (productos, marcas, categorías — como en el header del diseño).
- Filtro por categoría como mínimo indispensable; filtros adicionales (precio, disponibilidad) son deseables pero no bloqueantes para el lanzamiento.

### 5.4 Carrito y checkout
- Carrito persistente durante la sesión (idealmente persistente por cuenta de usuario).
- **Registro obligatorio antes de pagar (solo durante fase de prueba del MVP):** el usuario no puede completar una compra como invitado; debe crear una cuenta (o iniciar sesión si ya la tiene) antes de acceder al checkout. El carrito puede armarse libremente sin cuenta, pero al pasar a pagar se exige login/registro.
- Checkout con: resumen de pedido, dirección de envío, selección de pago.
- Pago con tarjeta vía Stripe (o pasarela equivalente), en USD.
- Confirmación de pedido (pantalla + email de confirmación).

*Decisión de fasing: el registro obligatorio es intencional solo para la fase de prueba (control de datos de cliente y validación del flujo con un grupo acotado). El requisito de habilitar checkout como invitado queda planificado para Fase 2 (ver sección "Explícitamente fuera de alcance"), una vez validado el MVP. La lógica de checkout debe construirse de forma que agregar el modo invitado después no implique rehacer el flujo de pago.*

### 5.5 Panel de administración
- Alta, edición y baja de productos (nombre, precio, categoría, imagen, descripción, stock).
- Gestión manual de stock (sin integración automática con proveedores).
- Gestión de categorías.
- Visualización y actualización de estado de pedidos (recibido, en preparación, enviado, entregado).

### 5.6 Envíos
- Cálculo y gestión de envío manejados internamente (logística propia), sin integración con API de courier en el MVP.
- Debe poder registrarse una dirección de envío por pedido.

## 6. Requisitos no funcionales

- **Seguridad de pagos:** ningún dato de tarjeta debe tocar el backend propio; debe procesarse a través de la pasarela de pago (Stripe o equivalente) cumpliendo PCI-DSS por diseño.
- **Responsive:** el sitio debe funcionar correctamente en escritorio y móvil (el diseño de referencia está en formato desktop fijo de 1440px; se requiere adaptar a mobile-first o al menos breakpoints razonables).
- **Rendimiento:** tiempos de carga aceptables para catálogo con volumen bajo-medio de productos (no se esperan picos masivos de tráfico en el MVP).
- **Disponibilidad:** sin requisito de alta disponibilidad crítica en el MVP (no es infraestructura de misión crítica todavía).
- **Stack técnico:** agnóstico — la decisión de framework, lenguaje y base de datos queda abierta para el momento de construcción con Claude Code.

## 7. Métricas de éxito del MVP

- La tienda permite completar el flujo completo: navegar → agregar al carrito → pagar → recibir confirmación, sin intervención manual del administrador.
- El administrador puede cargar un catálogo completo de productos y gestionar pedidos sin soporte técnico externo.
- Al menos una transacción real procesada con éxito vía la pasarela de pago.

*(Nota: al ser MVP recién lanzado, no hay aún metas cuantitativas de conversión o tráfico — esto se define después de tener datos reales.)*

## 8. Riesgos y supuestos

- **Supuesto:** el volumen inicial de productos y pedidos es bajo-medio; no se ha definido un número estimado de SKUs — recomendable definirlo antes de diseñar el modelo de datos del catálogo.
- **Supuesto:** al no haber presupuesto ni plazo definidos en esta conversación, no se puede priorizar entre "rápido y simple" vs. "más robusto"; esto queda como decisión abierta.
- **Riesgo:** el diseño de referencia está en inglés y USD; si el mercado real cambia a español/otra moneda antes del lanzamiento, hay retrabajo de contenido (no solo de código).
- **Riesgo:** la logística propia (sin courier externo) puede no escalar si el volumen de pedidos crece rápido — aceptable para MVP, a revisar en Fase 2.

## 9. Decisiones pendientes (marcadas explícitamente, no asumidas)

El diseño visual (`HAG Supply Homepage.dc.html`) incluye elementos que **no fueron confirmados** como funcionalidades del MVP durante la definición de alcance. Antes de construir, decide si quedan dentro o fuera:

1. **Favoritos/Wishlist:** el header muestra un ícono de "Favorites". ¿Debe ser funcional en el MVP o solo un placeholder visual para fase futura?
2. **Reseñas y calificaciones:** las tarjetas de producto muestran estrellas y número de 