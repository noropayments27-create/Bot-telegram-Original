-- Seed products for BOT de ventas (demo)
-- Inserts 45 active products across SHOP, METODOS, VIP, WEB.

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 💳 Venta de Tarjetas', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 💳 Venta de Tarjetas');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🔗 Links de CCS Shop', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🔗 Links de CCS Shop');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🕵️ Foros de Carding', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🕵️ Foros de Carding');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 📊 Paneles SMM', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 📊 Paneles SMM');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 📲 Paneles SMS', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 📲 Paneles SMS');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🎁 Paneles Gift Card', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🎁 Paneles Gift Card');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🎬 Paneles Streaming', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🎬 Paneles Streaming');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🎮 Paneles de Juegos', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🎮 Paneles de Juegos');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 📧 Emails Temporales', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 📧 Emails Temporales');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🌐 Hosting y Dominios', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🌐 Hosting y Dominios');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🧾 Logs y Bases de Datos', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🧾 Logs y Bases de Datos');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🛡️ VPN Premium', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🛡️ VPN Premium');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🧰 Herramientas Digitales', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🧰 Herramientas Digitales');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 📥 Descargas Premium', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 📥 Descargas Premium');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🤖 Bots Automatizados', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🤖 Bots Automatizados');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 💼 Servicios Freelance', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 💼 Servicios Freelance');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🧑‍💻 Cursos y Tutoriales', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🧑‍💻 Cursos y Tutoriales');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP - 🔐 Cuentas Verificadas', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP - 🔐 Cuentas Verificadas');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Flux', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Flux');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Atlas', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Atlas');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Prisma', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Prisma');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Vector', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Vector');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Delta', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Delta');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Pulse', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Pulse');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Nova', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Nova');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Sigma', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Sigma');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS - ✅ Método Orion', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS - ✅ Método Orion');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Aurora', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Aurora');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Nexus', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Nexus');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Zenith', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Zenith');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Pulse', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Pulse');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Prime', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Prime');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Terra', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Terra');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Sigma', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Sigma');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Stellar', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Stellar');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP - 💬 VIP Omega', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP - 💬 VIP Omega');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Pack Landing Pro', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Pack Landing Pro');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Script Auto', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Script Auto');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Toolkit SEO', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Toolkit SEO');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Panel Web Lite', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Panel Web Lite');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Web Starter', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Web Starter');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Bot Web', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Bot Web');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Pack UI', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Pack UI');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Web Plus', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Web Plus');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB - 💻 Web Master', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB - 💻 Web Master');
