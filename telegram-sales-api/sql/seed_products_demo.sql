-- Seed products for BOT de ventas (demo)
-- Inserts 45 active products across SHOP, METODOS, VIP, WEB.

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 01 - 💳 Venta de Tarjetas', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 01 - 💳 Venta de Tarjetas');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 02 - 🔗 Links de CCS Shop', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 02 - 🔗 Links de CCS Shop');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 03 - 🕵️ Foros de Carding', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 03 - 🕵️ Foros de Carding');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 04 - 📊 Paneles SMM', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 04 - 📊 Paneles SMM');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 05 - 📲 Paneles SMS', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 05 - 📲 Paneles SMS');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 06 - 🎁 Paneles Gift Card', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 06 - 🎁 Paneles Gift Card');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 07 - 🎬 Paneles Streaming', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 07 - 🎬 Paneles Streaming');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 08 - 🎮 Paneles de Juegos', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 08 - 🎮 Paneles de Juegos');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 09 - 📧 Emails Temporales', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 09 - 📧 Emails Temporales');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 10 - 🌐 Hosting y Dominios', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 10 - 🌐 Hosting y Dominios');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 11 - 🧾 Logs y Bases de Datos', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 11 - 🧾 Logs y Bases de Datos');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 12 - 🛡️ VPN Premium', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 12 - 🛡️ VPN Premium');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 13 - 🧰 Herramientas Digitales', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 13 - 🧰 Herramientas Digitales');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 14 - 📥 Descargas Premium', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 14 - 📥 Descargas Premium');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 15 - 🤖 Bots Automatizados', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 15 - 🤖 Bots Automatizados');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 16 - 💼 Servicios Freelance', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 16 - 💼 Servicios Freelance');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 17 - 🧑‍💻 Cursos y Tutoriales', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 17 - 🧑‍💻 Cursos y Tutoriales');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'SHOP 18 - 🔐 Cuentas Verificadas', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'SHOP 18 - 🔐 Cuentas Verificadas');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 01 - ✅ Método Flux', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 01 - ✅ Método Flux');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 02 - ✅ Método Atlas', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 02 - ✅ Método Atlas');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 03 - ✅ Método Prisma', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 03 - ✅ Método Prisma');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 04 - ✅ Método Vector', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 04 - ✅ Método Vector');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 05 - ✅ Método Delta', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 05 - ✅ Método Delta');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 06 - ✅ Método Pulse', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 06 - ✅ Método Pulse');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 07 - ✅ Método Nova', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 07 - ✅ Método Nova');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 08 - ✅ Método Sigma', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 08 - ✅ Método Sigma');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'METODOS 09 - ✅ Método Orion', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'METODOS 09 - ✅ Método Orion');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 01 - 💬 VIP Aurora', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 01 - 💬 VIP Aurora');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 02 - 💬 VIP Nexus', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 02 - 💬 VIP Nexus');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 03 - 💬 VIP Zenith', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 03 - 💬 VIP Zenith');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 04 - 💬 VIP Pulse', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 04 - 💬 VIP Pulse');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 05 - 💬 VIP Prime', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 05 - 💬 VIP Prime');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 06 - 💬 VIP Terra', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 06 - 💬 VIP Terra');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 07 - 💬 VIP Sigma', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 07 - 💬 VIP Sigma');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 08 - 💬 VIP Stellar', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 08 - 💬 VIP Stellar');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'VIP 09 - 💬 VIP Omega', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'VIP 09 - 💬 VIP Omega');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 01 - 💻 Pack Landing Pro', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 01 - 💻 Pack Landing Pro');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 02 - 💻 Script Auto', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 02 - 💻 Script Auto');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 03 - 💻 Toolkit SEO', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 03 - 💻 Toolkit SEO');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 04 - 💻 Panel Web Lite', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 04 - 💻 Panel Web Lite');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 05 - 💻 Web Starter', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 05 - 💻 Web Starter');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 06 - 💻 Bot Web', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 06 - 💻 Bot Web');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 07 - 💻 Pack UI', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 07 - 💻 Pack UI');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 08 - 💻 Web Plus', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 08 - 💻 Web Plus');

INSERT INTO products (name, description, price, is_active, delivery_type, delivery_payload)
SELECT 'WEB 09 - 💻 Web Master', 'Producto de prueba', 20.00, true, 'LINK',
       '{"url":"https://example.com/entrega-demo","note":"Entrega de prueba"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'WEB 09 - 💻 Web Master');
