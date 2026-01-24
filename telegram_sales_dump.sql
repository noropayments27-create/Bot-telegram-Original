--
-- PostgreSQL database dump
--

\restrict r2XnkG1AIio0jHt1Adc0M3iy2jkV6L5XvA018COVcVLuuHzsUHCcHxUjuByEeyl

-- Dumped from database version 18.1 (Postgres.app)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: affiliate_invoice_status; Type: TYPE; Schema: public; Owner: muza
--

CREATE TYPE public.affiliate_invoice_status AS ENUM (
    'PENDING',
    'PAID',
    'CANCELLED',
    'EXPIRED'
);


ALTER TYPE public.affiliate_invoice_status OWNER TO muza;

--
-- Name: affiliate_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.affiliate_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public.affiliate_status OWNER TO telegram;

--
-- Name: broadcast_destination; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.broadcast_destination AS ENUM (
    'DM',
    'CHANNEL',
    'GROUP'
);


ALTER TYPE public.broadcast_destination OWNER TO telegram;

--
-- Name: broadcast_segment; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.broadcast_segment AS ENUM (
    'ALL',
    'CLIENTS',
    'AFFILIATES',
    'LEADS',
    'BY_PRODUCT',
    'BUYERS_AFFILIATES',
    'GROUPS',
    'BUYERS',
    'CHANNELS'
);


ALTER TYPE public.broadcast_segment OWNER TO telegram;

--
-- Name: broadcast_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.broadcast_status AS ENUM (
    'DRAFT',
    'SENT',
    'FAILED'
);


ALTER TYPE public.broadcast_status OWNER TO telegram;

--
-- Name: commission_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.commission_status AS ENUM (
    'EARNED',
    'PAID_OUT',
    'RESERVED',
    'REFUNDED'
);


ALTER TYPE public.commission_status OWNER TO telegram;

--
-- Name: delivery_type; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.delivery_type AS ENUM (
    'FILE',
    'TEXT',
    'IMAGE',
    'VIDEO',
    'LINK',
    'EXPIRING_LINK'
);


ALTER TYPE public.delivery_type OWNER TO telegram;

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.order_status AS ENUM (
    'CREATED',
    'WAITING_PAYMENT',
    'PAID',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
    'EXPIRED'
);


ALTER TYPE public.order_status OWNER TO telegram;

--
-- Name: payment_review_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.payment_review_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public.payment_review_status OWNER TO telegram;

--
-- Name: payout_method; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.payout_method AS ENUM (
    'USDT_BSC',
    'BINANCE_ID',
    'NEQUI'
);


ALTER TYPE public.payout_method OWNER TO telegram;

--
-- Name: payout_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.payout_status AS ENUM (
    'REQUESTED',
    'SENT',
    'CANCELLED'
);


ALTER TYPE public.payout_status OWNER TO telegram;

--
-- Name: stock_mode_enum; Type: TYPE; Schema: public; Owner: muza
--

CREATE TYPE public.stock_mode_enum AS ENUM (
    'SIMPLE',
    'UNITS'
);


ALTER TYPE public.stock_mode_enum OWNER TO muza;

--
-- Name: stock_unit_status_enum; Type: TYPE; Schema: public; Owner: muza
--

CREATE TYPE public.stock_unit_status_enum AS ENUM (
    'AVAILABLE',
    'HELD',
    'DELIVERED'
);


ALTER TYPE public.stock_unit_status_enum OWNER TO muza;

--
-- Name: ticket_sender; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.ticket_sender AS ENUM (
    'USER',
    'ADMIN'
);


ALTER TYPE public.ticket_sender OWNER TO telegram;

--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: telegram
--

CREATE TYPE public.ticket_status AS ENUM (
    'OPEN',
    'CLOSED'
);


ALTER TYPE public.ticket_status OWNER TO telegram;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: affiliate_adjustments; Type: TABLE; Schema: public; Owner: muza
--

CREATE TABLE public.affiliate_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    affiliate_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text,
    status public.commission_status DEFAULT 'EARNED'::public.commission_status NOT NULL,
    created_by_admin_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reserved_amount numeric(12,2) DEFAULT 0 NOT NULL,
    paid_out_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT affiliate_adjustments_amount_nonzero CHECK ((amount <> (0)::numeric)),
    CONSTRAINT affiliate_adjustments_paid_out_amount_nonnegative CHECK ((paid_out_amount >= (0)::numeric)),
    CONSTRAINT affiliate_adjustments_reserved_amount_nonnegative CHECK ((reserved_amount >= (0)::numeric))
);


ALTER TABLE public.affiliate_adjustments OWNER TO muza;

--
-- Name: affiliate_invoices; Type: TABLE; Schema: public; Owner: muza
--

CREATE TABLE public.affiliate_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    affiliate_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text,
    status public.affiliate_invoice_status DEFAULT 'PENDING'::public.affiliate_invoice_status NOT NULL,
    created_by_admin_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
    expired_at timestamp with time zone,
    CONSTRAINT affiliate_invoices_amount_check CHECK ((amount > (0)::numeric))
);


ALTER TABLE public.affiliate_invoices OWNER TO muza;

--
-- Name: affiliates; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.affiliates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.affiliate_status DEFAULT 'PENDING'::public.affiliate_status NOT NULL,
    wallet_usdt_bsc text,
    binance_id text,
    commission_rate numeric(6,4) DEFAULT 0 NOT NULL,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    wallet_nequi text,
    affiliate_debt numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT affiliates_affiliate_debt_check CHECK ((affiliate_debt >= (0)::numeric))
);


ALTER TABLE public.affiliates OWNER TO telegram;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO telegram;

--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment public.broadcast_segment NOT NULL,
    product_id uuid,
    destination public.broadcast_destination NOT NULL,
    message_text text NOT NULL,
    status public.broadcast_status DEFAULT 'DRAFT'::public.broadcast_status NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_path text,
    image_filename text,
    image_mime text,
    buttons jsonb,
    saved boolean DEFAULT false NOT NULL
);


ALTER TABLE public.broadcasts OWNER TO telegram;

--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    qty integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_price_usd numeric(12,2) DEFAULT 0 NOT NULL,
    total_price_usd numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT cart_items_qty_check CHECK ((qty > 0))
);


ALTER TABLE public.cart_items OWNER TO telegram;

--
-- Name: carts; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_id bigint NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.carts OWNER TO telegram;

--
-- Name: commissions; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    affiliate_id uuid NOT NULL,
    rate numeric(6,4) NOT NULL,
    amount numeric(12,2) NOT NULL,
    status public.commission_status DEFAULT 'EARNED'::public.commission_status NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_out_at timestamp with time zone,
    refunded_amount numeric(12,2) DEFAULT 0 NOT NULL,
    refunded_at timestamp with time zone,
    refund_reason text,
    reserved_amount numeric(12,2) DEFAULT 0 NOT NULL,
    paid_out_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT commissions_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT commissions_paid_out_amount_nonnegative CHECK ((paid_out_amount >= (0)::numeric)),
    CONSTRAINT commissions_rate_check CHECK ((rate >= (0)::numeric)),
    CONSTRAINT commissions_refunded_amount_check CHECK ((refunded_amount >= (0)::numeric)),
    CONSTRAINT commissions_reserved_amount_nonnegative CHECK ((reserved_amount >= (0)::numeric))
);


ALTER TABLE public.commissions OWNER TO telegram;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    qty integer NOT NULL,
    price_usd numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_price_usd numeric(12,2) DEFAULT 0 NOT NULL,
    total_price_usd numeric(12,2) DEFAULT 0 NOT NULL,
    line_total_usd numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT order_items_qty_check CHECK ((qty > 0))
);


ALTER TABLE public.order_items OWNER TO telegram;

--
-- Name: order_payments; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    screenshot_file_id text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    review_status public.payment_review_status DEFAULT 'PENDING'::public.payment_review_status NOT NULL,
    reviewed_by_admin_at timestamp with time zone,
    payment_method text
);


ALTER TABLE public.order_payments OWNER TO telegram;

--
-- Name: order_refunds; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.order_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    refund_type text NOT NULL,
    reason text,
    refunded_by_admin text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT order_refunds_refund_type_check CHECK ((refund_type = ANY (ARRAY['PARTIAL'::text, 'FULL'::text])))
);


ALTER TABLE public.order_refunds OWNER TO telegram;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    affiliate_id uuid,
    status public.order_status DEFAULT 'CREATED'::public.order_status NOT NULL,
    unit_price_at_purchase numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    delivered_at timestamp with time zone,
    order_number bigint,
    refunded_at timestamp with time zone,
    refunded_amount numeric(12,2) DEFAULT 0 NOT NULL,
    refund_reason text,
    cancelled_at timestamp with time zone,
    cancel_source text,
    CONSTRAINT orders_refunded_amount_check CHECK ((refunded_amount >= (0)::numeric)),
    CONSTRAINT orders_unit_price_at_purchase_check CHECK ((unit_price_at_purchase >= (0)::numeric))
);


ALTER TABLE public.orders OWNER TO telegram;

--
-- Name: orders_order_number_seq; Type: SEQUENCE; Schema: public; Owner: muza
--

CREATE SEQUENCE public.orders_order_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_order_number_seq OWNER TO muza;

--
-- Name: payout_adjustments; Type: TABLE; Schema: public; Owner: muza
--

CREATE TABLE public.payout_adjustments (
    payout_id uuid NOT NULL,
    adjustment_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payout_adjustments OWNER TO muza;

--
-- Name: payout_items; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.payout_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payout_id uuid NOT NULL,
    commission_id uuid NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payout_items OWNER TO telegram;

--
-- Name: payouts; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    affiliate_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    method public.payout_method NOT NULL,
    destination text NOT NULL,
    status public.payout_status DEFAULT 'REQUESTED'::public.payout_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    debt_applied numeric(12,2) DEFAULT 0 NOT NULL,
    receipt_path text,
    receipt_filename text,
    receipt_mime text,
    CONSTRAINT payouts_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payouts_debt_applied_check CHECK ((debt_applied >= (0)::numeric))
);


ALTER TABLE public.payouts OWNER TO telegram;

--
-- Name: product_stock_holds; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.product_stock_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    order_id uuid,
    cart_id uuid,
    telegram_id bigint,
    qty integer NOT NULL,
    status text DEFAULT 'HELD'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_stock_holds_qty_check CHECK ((qty > 0))
);


ALTER TABLE public.product_stock_holds OWNER TO telegram;

--
-- Name: product_stock_units; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.product_stock_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.stock_unit_status_enum DEFAULT 'AVAILABLE'::public.stock_unit_status_enum NOT NULL,
    held_by_order_id uuid,
    held_by_telegram_id bigint,
    held_by_username text,
    held_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.product_stock_units OWNER TO telegram;

--
-- Name: products_sku_key_seq; Type: SEQUENCE; Schema: public; Owner: muza
--

CREATE SEQUENCE public.products_sku_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_sku_key_seq OWNER TO muza;

--
-- Name: products; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(12,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    delivery_type public.delivery_type NOT NULL,
    delivery_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    sku_key text DEFAULT lpad((nextval('public.products_sku_key_seq'::regclass))::text, 6, '0'::text),
    stock_mode public.stock_mode_enum DEFAULT 'SIMPLE'::public.stock_mode_enum NOT NULL,
    stock_qty integer,
    show_stock boolean DEFAULT true NOT NULL,
    delivery_template text,
    unique_purchase boolean DEFAULT false NOT NULL,
    CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT products_stock_qty_nonnegative CHECK (((stock_qty IS NULL) OR (stock_qty >= 0)))
);


ALTER TABLE public.products OWNER TO telegram;

--
-- Name: support_bans; Type: TABLE; Schema: public; Owner: muza
--

CREATE TABLE public.support_bans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_id bigint NOT NULL,
    reason text,
    banned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.support_bans OWNER TO muza;

--
-- Name: ticket_messages; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender public.ticket_sender NOT NULL,
    message_text text,
    telegram_file_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_messages_check CHECK (((message_text IS NOT NULL) OR (telegram_file_id IS NOT NULL)))
);


ALTER TABLE public.ticket_messages OWNER TO telegram;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.ticket_status DEFAULT 'OPEN'::public.ticket_status NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    allow_image boolean DEFAULT false NOT NULL
);


ALTER TABLE public.tickets OWNER TO telegram;

--
-- Name: user_bans; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.user_bans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_id bigint NOT NULL,
    reason text,
    banned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_bans OWNER TO telegram;

--
-- Name: users; Type: TABLE; Schema: public; Owner: telegram
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_id bigint NOT NULL,
    telegram_username text,
    referred_by_affiliate_id uuid,
    referred_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locale text DEFAULT 'es'::text NOT NULL,
    telegram_photo_file_id text,
    CONSTRAINT users_locale_check CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text])))
);


ALTER TABLE public.users OWNER TO telegram;

--
-- Data for Name: affiliate_adjustments; Type: TABLE DATA; Schema: public; Owner: muza
--

COPY public.affiliate_adjustments (id, affiliate_id, amount, reason, status, created_by_admin_id, created_at, reserved_amount, paid_out_amount) FROM stdin;
3d267aeb-2fcf-483f-83b7-f6f5c167efc6	0252c270-fe08-467b-810a-3a3d3841d112	-4.00	Pago automatico de deuda	EARNED	\N	2026-01-22 20:06:17.980021-05	0.00	0.00
cba5b122-8658-418e-9da5-d372bc0c2062	0252c270-fe08-467b-810a-3a3d3841d112	-0.75	Pago automatico de deuda	EARNED	\N	2026-01-22 20:07:53.614324-05	0.00	0.00
cf1be5e9-ddc7-4dfe-ae42-17cb6e56f2af	0252c270-fe08-467b-810a-3a3d3841d112	-20.00	Factura: hola	EARNED	\N	2026-01-23 00:08:50.943346-05	0.00	0.00
08aa49d1-2981-489b-ba2c-6b6896fa1880	0252c270-fe08-467b-810a-3a3d3841d112	-10.00	Factura: metodo	EARNED	\N	2026-01-23 02:45:19.552858-05	0.00	0.00
26aa0f3b-e724-413f-8811-870082a90755	0252c270-fe08-467b-810a-3a3d3841d112	100.00	metodo	EARNED	7621162350	2026-01-23 02:48:38.259104-05	0.00	0.00
a20a1459-d076-4ceb-be25-8fed68ae520b	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 02:56:07.542903-05	0.00	0.00
ec75ffd2-6cc7-4b11-89a6-81a83fc1d050	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 03:01:18.018033-05	0.00	0.00
4e85287a-54d2-411f-afd4-abd076bf068f	e5d3d7c3-8387-42ad-8563-bc49fed0c017	-5.00	Factura	EARNED	\N	2026-01-23 03:05:07.467503-05	0.00	0.00
05c42c67-5156-4589-947c-4adce6a8d752	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 03:21:44.084228-05	0.00	0.00
05e59bb3-414d-4e9d-bdf5-dfc56833dcd2	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 03:33:01.296622-05	0.00	0.00
4d3b070e-2fa0-47f7-8efb-7806b4e358ed	0252c270-fe08-467b-810a-3a3d3841d112	10.00	Regalo	EARNED	7621162350	2026-01-23 22:47:41.417005-05	0.00	0.00
d53e8f2f-df4a-4944-9c8e-068df45a2ace	0252c270-fe08-467b-810a-3a3d3841d112	20000.00	\N	EARNED	7621162350	2026-01-22 06:43:06.449214-05	0.00	145.50
f283e1e7-4ce3-40c1-acf6-a79d99a6ea5c	0252c270-fe08-467b-810a-3a3d3841d112	-20.00	toma una captura de esta pantalla y paga, luego vas y compras el metodo que quieras, y cuando te pidan captura envias esta.	PAID_OUT	\N	2026-01-22 05:23:16.164691-05	0.00	0.00
8d5bf33f-44ea-4fe1-9e33-f1f5c6e4ae1c	0252c270-fe08-467b-810a-3a3d3841d112	-1000.00	Factura	EARNED	\N	2026-01-22 06:43:52.791605-05	0.00	0.00
e6fff188-af8d-4b3b-9f33-eada8e86df96	0252c270-fe08-467b-810a-3a3d3841d112	-17900.00	Factura	EARNED	\N	2026-01-22 17:19:23.867591-05	0.00	0.00
2b4e1ac9-6512-4218-a447-d22007ebca99	0252c270-fe08-467b-810a-3a3d3841d112	-141.25	\N	EARNED	7621162350	2026-01-22 17:41:15.78153-05	0.00	0.00
d77baea8-98a1-4c61-b6bd-d87617f15cf1	0252c270-fe08-467b-810a-3a3d3841d112	31.00	\N	EARNED	7621162350	2026-01-22 17:44:32.365741-05	0.00	0.00
411e1f8e-4f6c-43d3-b39d-bf3cb50cfee3	0252c270-fe08-467b-810a-3a3d3841d112	200.00	\N	EARNED	7621162350	2026-01-22 20:50:49.854429-05	0.00	0.00
59920515-8e5c-4bda-9fe4-911d9632ffc5	0252c270-fe08-467b-810a-3a3d3841d112	-195.25	Pago automatico de deuda	EARNED	7621162350	2026-01-22 20:50:49.854429-05	0.00	0.00
8aec02c9-c421-44a2-aec7-d0d8d0e08473	0252c270-fe08-467b-810a-3a3d3841d112	-20.00	Factura	EARNED	\N	2026-01-23 02:40:39.198993-05	0.00	0.00
f4d46f50-cd91-43c3-a22f-2e1628b5a088	0252c270-fe08-467b-810a-3a3d3841d112	-1.00	Factura: metodo	EARNED	\N	2026-01-23 02:46:55.748861-05	0.00	0.00
7293bae7-ef79-45eb-892e-6cf80532d8d1	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 02:51:29.544839-05	0.00	0.00
9abadf73-5bfe-47cf-b6dc-1d55461a9104	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 02:56:51.917194-05	0.00	0.00
4a5a64f2-c600-421a-a9df-1ec453f296b6	0252c270-fe08-467b-810a-3a3d3841d112	-1.00	\N	PAID_OUT	\N	2026-01-22 05:46:24.336002-05	0.00	0.00
f0e446bf-a22d-49dd-bcef-fae147911ed7	0252c270-fe08-467b-810a-3a3d3841d112	-1000.00	Factura	EARNED	\N	2026-01-22 06:46:19.578421-05	0.00	0.00
6e8f099d-0438-4446-af06-362719686ea4	0252c270-fe08-467b-810a-3a3d3841d112	80.00	\N	EARNED	7621162350	2026-01-22 17:26:06.959186-05	0.00	0.00
af08264b-44ce-4d3b-ab27-2cee0690617f	0252c270-fe08-467b-810a-3a3d3841d112	5.00	\N	EARNED	7621162350	2026-01-22 17:44:21.04908-05	0.00	0.00
7fc854aa-3573-488d-9351-cad810c9d1f9	0252c270-fe08-467b-810a-3a3d3841d112	-2.25	Pago automatico de deuda	EARNED	7621162350	2026-01-22 17:44:21.04908-05	0.00	0.00
592d7dd5-3be1-48ec-9a32-08eea87bad91	0252c270-fe08-467b-810a-3a3d3841d112	100.00	\N	EARNED	7621162350	2026-01-22 18:02:26.128705-05	0.00	0.00
e979b54b-7aa6-4919-8d97-116598065a16	e5d3d7c3-8387-42ad-8563-bc49fed0c017	122.00	\N	EARNED	7621162350	2026-01-23 03:04:29.840832-05	0.00	0.00
5e56e4ed-f9ac-461a-a5fb-302396d95fc8	0252c270-fe08-467b-810a-3a3d3841d112	-2.00	Factura	EARNED	\N	2026-01-23 03:17:45.00252-05	0.00	0.00
10b2742a-5ee6-49d2-ae34-ecc68861e50c	0252c270-fe08-467b-810a-3a3d3841d112	-21.00	Factura	EARNED	\N	2026-01-23 03:23:18.461283-05	0.00	0.00
61728dc4-2bd6-4f8a-bffe-2f1ef4ad1225	0252c270-fe08-467b-810a-3a3d3841d112	-50.00	Factura	EARNED	\N	2026-01-23 08:32:55.70211-05	0.00	0.00
487981de-465a-4dc1-bb43-291aeea0b028	0252c270-fe08-467b-810a-3a3d3841d112	50.00	\N	EARNED	7621162350	2026-01-23 23:18:21.894704-05	0.00	0.00
\.


--
-- Data for Name: affiliate_invoices; Type: TABLE DATA; Schema: public; Owner: muza
--

COPY public.affiliate_invoices (id, affiliate_id, amount, reason, status, created_by_admin_id, created_at, paid_at, cancelled_at, expires_at, expired_at) FROM stdin;
8bd64133-d483-48b1-8de9-b6fb6505a704	0252c270-fe08-467b-810a-3a3d3841d112	20.00	toma una captura de esta pantalla y paga, luego vas y compras el metodo que quieras, y cuando te pidan captura envias esta.	PAID	7621162350	2026-01-22 05:22:44.901933-05	2026-01-22 05:23:16.164691-05	\N	2026-01-22 05:32:44.901933-05	\N
733d25a1-53fe-4572-bc55-a8e9927a239c	0252c270-fe08-467b-810a-3a3d3841d112	1.00	\N	PAID	7621162350	2026-01-22 05:46:16.742441-05	2026-01-22 05:46:24.336002-05	\N	2026-01-22 05:56:16.742441-05	\N
8b499814-f444-4d68-a2bf-d8ac6f31c5e4	0252c270-fe08-467b-810a-3a3d3841d112	1000.00	\N	PAID	7621162350	2026-01-22 06:43:38.754891-05	2026-01-22 06:43:52.791605-05	\N	2026-01-22 06:53:38.754891-05	\N
ca42ef90-22fa-4be2-bf90-1fe75781f535	0252c270-fe08-467b-810a-3a3d3841d112	1000.00	\N	PAID	7621162350	2026-01-22 06:46:08.699834-05	2026-01-22 06:46:19.578421-05	\N	2026-01-22 06:56:08.699834-05	\N
cfbc9b3c-5abd-4bab-a753-cd0b70d0088c	0252c270-fe08-467b-810a-3a3d3841d112	17900.00	\N	PAID	7621162350	2026-01-22 17:19:12.688255-05	2026-01-22 17:19:23.867591-05	\N	2026-01-22 17:29:12.688255-05	\N
398b43d6-8697-4277-9139-05806b7168a0	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 03:32:14.869611-05	2026-01-23 03:33:01.296622-05	\N	2026-01-23 03:42:14.869611-05	\N
58ecba30-b759-4d5f-a567-57fb9a0d7403	0252c270-fe08-467b-810a-3a3d3841d112	20.00	hola	CANCELLED	7621162350	2026-01-23 00:07:26.661543-05	\N	2026-01-23 00:08:35.207586-05	2026-01-23 00:17:26.661543-05	\N
91234c96-a8e1-473f-bb47-e954feef0453	0252c270-fe08-467b-810a-3a3d3841d112	20.00	hola	PAID	7621162350	2026-01-23 00:08:45.342745-05	2026-01-23 00:08:50.943346-05	\N	2026-01-23 00:18:45.342745-05	\N
743fde48-1d2a-49a6-b1d3-497f3a7c2e7c	0252c270-fe08-467b-810a-3a3d3841d112	20.00	\N	EXPIRED	7621162350	2026-01-22 23:32:11.415492-05	\N	\N	2026-01-22 23:42:11.415492-05	2026-01-23 02:32:47.109184-05
0b0c07d2-0654-4bac-808c-0de480949875	0252c270-fe08-467b-810a-3a3d3841d112	20.00	\N	PAID	7621162350	2026-01-23 02:40:04.189165-05	2026-01-23 02:40:39.198993-05	\N	2026-01-23 02:50:04.189165-05	\N
e736a617-455c-4084-9040-145adf599339	0252c270-fe08-467b-810a-3a3d3841d112	10.00	metodo	PAID	7621162350	2026-01-23 02:45:11.68691-05	2026-01-23 02:45:19.552858-05	\N	2026-01-23 02:55:11.68691-05	\N
b94726e5-9a3e-4382-8b24-5063601042c3	0252c270-fe08-467b-810a-3a3d3841d112	1.00	metodo	PAID	7621162350	2026-01-23 02:45:35.592838-05	2026-01-23 02:46:55.748861-05	\N	2026-01-23 02:55:35.592838-05	\N
7c45f297-7595-4485-b23f-de7bc6850289	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 02:51:19.907712-05	2026-01-23 02:51:29.544839-05	\N	2026-01-23 03:01:19.907712-05	\N
af02b083-6bd4-491f-ba0a-6a5bde9841e3	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	CANCELLED	7621162350	2026-01-23 02:51:39.968326-05	\N	2026-01-23 02:51:43.694099-05	2026-01-23 03:01:39.968326-05	\N
a3678765-ea87-49d3-9814-96da6648523d	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 02:55:58.601993-05	2026-01-23 02:56:07.542903-05	\N	2026-01-23 03:05:58.601993-05	\N
fefb3a5d-54db-4d97-a8c1-b485fb9a71c2	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	CANCELLED	7621162350	2026-01-23 02:56:20.732497-05	\N	2026-01-23 02:56:28.549447-05	2026-01-23 03:06:20.732497-05	\N
b7eed700-f119-457f-a72d-19494a9f52ef	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 02:56:43.33002-05	2026-01-23 02:56:51.917194-05	\N	2026-01-23 03:06:43.33002-05	\N
306741dc-ff0e-4360-8cdc-83f705a61948	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 03:01:09.304-05	2026-01-23 03:01:18.018033-05	\N	2026-01-23 03:11:09.304-05	\N
c0a11e8f-af96-4a72-98bb-dd58f24690c5	e5d3d7c3-8387-42ad-8563-bc49fed0c017	5.00	\N	PAID	7621162350	2026-01-23 03:04:41.087417-05	2026-01-23 03:05:07.467503-05	\N	2026-01-23 03:14:41.087417-05	\N
0811d458-9477-45f3-a40d-2f020d5abceb	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 03:17:30.440542-05	2026-01-23 03:17:45.00252-05	\N	2026-01-23 03:27:30.440542-05	\N
bd99bac0-ab5a-4ef7-9b60-d2ed2a525ce7	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	PAID	7621162350	2026-01-23 03:21:37.955351-05	2026-01-23 03:21:44.084228-05	\N	2026-01-23 03:31:37.955351-05	\N
359ebf58-01f0-48be-b9f9-0be90f6127fa	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	CANCELLED	7621162350	2026-01-23 03:21:54.76397-05	\N	2026-01-23 03:22:01.999907-05	2026-01-23 03:31:54.76397-05	\N
eec3c3a4-5c48-454a-b539-39f8b9a753a8	0252c270-fe08-467b-810a-3a3d3841d112	21.00	\N	PAID	7621162350	2026-01-23 03:22:20.949873-05	2026-01-23 03:23:18.461283-05	\N	2026-01-23 03:32:20.949873-05	\N
0e5ebcb2-0864-4b4c-9cc5-0d7087ff1e64	0252c270-fe08-467b-810a-3a3d3841d112	2.00	\N	CANCELLED	7621162350	2026-01-23 03:33:07.334262-05	\N	2026-01-23 03:33:18.886949-05	2026-01-23 03:43:07.334262-05	\N
ef6d5fc4-900f-4388-9ace-9bbf014b85e9	0252c270-fe08-467b-810a-3a3d3841d112	50.00	\N	CANCELLED	7621162350	2026-01-23 08:21:10.405807-05	\N	2026-01-23 08:23:57.606094-05	2026-01-23 08:31:10.405807-05	\N
64eb73de-38b5-4863-a43d-0468faa43c1b	0252c270-fe08-467b-810a-3a3d3841d112	50.00	\N	CANCELLED	7621162350	2026-01-23 08:24:03.440207-05	\N	2026-01-23 08:31:02.969181-05	2026-01-23 08:34:03.440207-05	\N
6c61250c-8228-41c0-a7bd-affcd2d2fbc5	0252c270-fe08-467b-810a-3a3d3841d112	50.00	\N	PAID	7621162350	2026-01-23 08:31:18.886535-05	2026-01-23 08:32:55.70211-05	\N	2026-01-23 08:41:18.886535-05	\N
\.


--
-- Data for Name: affiliates; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.affiliates (id, user_id, status, wallet_usdt_bsc, binance_id, commission_rate, approved_at, created_at, wallet_nequi, affiliate_debt) FROM stdin;
e5d3d7c3-8387-42ad-8563-bc49fed0c017	cd8e170f-f4e1-4a06-926f-d6de78b8894a	APPROVED	\N	67328482391	0.0000	2026-01-20 11:13:09.151671-05	2026-01-20 11:12:39.931371-05	\N	0.00
0252c270-fe08-467b-810a-3a3d3841d112	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	APPROVED	0xa24dcff8ee877f3479468039affb0371a93dc842	\N	0.0000	2025-12-31 19:00:00-05	2026-01-05 17:02:09.154091-05	\N	0.00
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.audit_logs (id, admin_action, entity_type, entity_id, meta, created_at) FROM stdin;
5eb07e44-7f7c-4ff8-8973-2fc64da062d5	BROADCAST_CUSTOM_RECIPIENTS	broadcast	805bdf1b-19b0-48dd-bcf8-902d4482ee96	{"telegram_ids": ["7949394998"]}	2026-01-06 02:22:51.215844-05
ed0be617-551d-494c-9edc-321b9a62f463	BROADCAST_CUSTOM_RECIPIENTS	broadcast	384bb84d-3517-42d7-937a-f53b0adadfe6	{"telegram_ids": ["7949394998"]}	2026-01-06 02:44:37.105404-05
8a45f947-1ac5-4999-8d3d-5f2b49a4ac52	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 2}	2026-01-11 03:53:50.692536-05
2887e6af-2bc8-4be2-a5d9-8744dccfd145	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 5}	2026-01-11 04:01:02.666194-05
6c0489d9-d4c7-4e90-8f68-43026d0e4940	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 20}	2026-01-11 04:01:40.022384-05
e3ede665-3da0-48f1-8b0d-1b647cb90d5d	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 6}	2026-01-11 04:03:23.635576-05
255c497e-7e43-4c94-bae5-b7d7c02469d5	ORDER_MARK_PAID	order	ae15da1d-bcc2-4d57-b143-a88abb6f8495	{"admin": "admin"}	2026-01-11 04:04:55.074597-05
c399158c-a390-4f60-8bc2-1e23726c2f5b	STOCK_TEMPLATE_SET	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"delivery_template": "hola mundo"}	2026-01-11 04:19:16.091343-05
bf2cafbb-8f2b-4319-bd04-a1b6124e3e5e	STOCK_UNITS_UPLOAD	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"sku_key": null, "product_ids": ["fb9d200f-5b61-42b0-924c-b6338b69b478"], "failed_count": 0, "inserted_count": 2}	2026-01-11 04:21:49.100227-05
150b2f8c-fd71-4df8-8f69-0e7eefe42695	STOCK_UNITS_UPLOAD	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"sku_key": null, "product_ids": ["fb9d200f-5b61-42b0-924c-b6338b69b478"], "failed_count": 0, "inserted_count": 2}	2026-01-11 04:47:25.576514-05
20625bd2-04c8-47c0-a70e-a053f65c87b5	STOCK_UNITS_UPLOAD	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"sku_key": null, "product_ids": ["fb9d200f-5b61-42b0-924c-b6338b69b478"], "failed_count": 0, "inserted_count": 2}	2026-01-11 04:59:13.526044-05
fee9974e-b12d-4ce3-8f09-7fec98eea0a7	STOCK_HOLD_RELEASE	product_stock_hold	a90f3606-0187-4d3f-837c-0b612735161d	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "a90f3606-0187-4d3f-837c-0b612735161d", "order_id": "03562ef1-0a25-4010-96d5-de25c90aaedb", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 16:38:54.339812-05
3ae45af3-e351-4efb-bcdd-3484e559a0f6	STOCK_HOLD_RELEASE	order	0640e79b-4ee3-4c25-9c6b-567f46b9607a	{"qty": 1, "mode": "UNITS", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "units-held-0640e79b-4ee3-4c25-9c6b-567f46b9607a", "order_id": "0640e79b-4ee3-4c25-9c6b-567f46b9607a", "product_id": "fb9d200f-5b61-42b0-924c-b6338b69b478"}	2026-01-11 16:42:51.934739-05
f9f3486d-c165-4854-963f-1823545dcea8	ORDER_MARK_PAID	order	5cdb0cb4-a475-4a07-8030-3cc3076f50dd	{"admin": "admin"}	2026-01-11 16:49:27.467151-05
db5d1ca1-87c7-43d8-b9f0-94d43ce2341f	ORDER_MARK_PAID	order	0c5107c5-8dc1-48f9-8a9c-13993bd7f750	{"admin": "admin"}	2026-01-11 16:52:15.717469-05
8f57a8f3-b343-4eab-adcb-ce6a44703c69	ORDER_MARK_PAID	order	196035b4-aa01-497e-ac6a-7a5db1e469d0	{"admin": "admin"}	2026-01-11 17:08:09.855-05
9e18778f-eac0-472f-9f71-5eb48cbee8e5	STOCK_HOLD_RELEASE	product_stock_hold	e7ab7d6c-1bea-4476-961d-b575bc60e2e7	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "e7ab7d6c-1bea-4476-961d-b575bc60e2e7", "order_id": "0f7406bb-0653-4aaa-8781-ef5233bbeaaa", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 17:11:32.624153-05
b48a2e58-bff9-4562-96e5-1a4d01e623c5	STOCK_HOLD_RELEASE	product_stock_hold	bdf7458b-3ffe-4866-a94a-e18bda7adca9	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "bdf7458b-3ffe-4866-a94a-e18bda7adca9", "order_id": "495837d4-287e-474c-aec7-38cb7cc61b5e", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 17:12:52.005809-05
de457ae4-fada-4adf-abda-0a5f864c824e	STOCK_HOLD_RELEASE	product_stock_hold	d3b17abf-8e34-4840-8e4b-191af239dc08	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "d3b17abf-8e34-4840-8e4b-191af239dc08", "order_id": "f6147e79-5a48-446b-ab1a-9921c07ec683", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 17:23:05.366813-05
4b81edba-2988-40ec-ae90-df4dea9b5b1a	STOCK_HOLD_RELEASE	product_stock_hold	403220e4-fedf-47a0-972a-b290889a75f9	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "403220e4-fedf-47a0-972a-b290889a75f9", "order_id": "8dd59d9a-76d0-44db-b472-edb57f7cd9af", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 17:46:23.451318-05
b9a01ce9-bfb0-4eaa-8034-0a72f2aeecaf	ORDER_CANCELLED_BY_HOLD_RELEASE	order	8dd59d9a-76d0-44db-b472-edb57f7cd9af	{"mode": "SIMPLE", "admin": "jwt", "reason": "HOLD_RELEASE", "hold_id": "403220e4-fedf-47a0-972a-b290889a75f9", "order_id": "8dd59d9a-76d0-44db-b472-edb57f7cd9af", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 17:46:23.451318-05
424d020e-7c14-4c49-9835-55b6c67992c5	STOCK_HOLD_RELEASE	product_stock_hold	6b04d5c8-7d22-4c45-9846-01188601a6dc	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "6b04d5c8-7d22-4c45-9846-01188601a6dc", "order_id": "ba989072-304b-409d-9bf8-845f15175783", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 18:03:12.847837-05
cc679d5a-840d-4754-87d8-f5cc16eceaa8	ORDER_CANCELLED_BY_HOLD_RELEASE	order	ba989072-304b-409d-9bf8-845f15175783	{"mode": "SIMPLE", "admin": "jwt", "reason": "HOLD_RELEASE", "hold_id": "6b04d5c8-7d22-4c45-9846-01188601a6dc", "order_id": "ba989072-304b-409d-9bf8-845f15175783", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 18:03:12.847837-05
56ac5233-d45f-4458-87ae-0ff34ecbc3f3	STOCK_HOLD_RELEASE	product_stock_hold	d6309769-086f-4d1e-b45a-03994423ea6b	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "d6309769-086f-4d1e-b45a-03994423ea6b", "order_id": "e425d88d-5c42-4b1d-ade0-d0a96e274a9a", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 18:05:20.107358-05
0c53c963-35bc-4ebb-8ffe-0393e103dee1	ORDER_CANCELLED_BY_HOLD_RELEASE	order	e425d88d-5c42-4b1d-ade0-d0a96e274a9a	{"mode": "SIMPLE", "admin": "jwt", "reason": "HOLD_RELEASE", "hold_id": "d6309769-086f-4d1e-b45a-03994423ea6b", "order_id": "e425d88d-5c42-4b1d-ade0-d0a96e274a9a", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 18:05:20.107358-05
f1d7b07d-e888-4bc2-923e-a678e9dbfb87	STOCK_HOLD_RELEASE	product_stock_hold	a4847dc8-4375-4bb7-9a7b-289ff35eeb1c	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "a4847dc8-4375-4bb7-9a7b-289ff35eeb1c", "order_id": "fe5deebf-01c8-4d2f-a1b8-edb89feeed17", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 18:17:33.323679-05
a0310d9d-4b28-4b38-b5c6-a163cf2c90a3	ORDER_CANCELLED_BY_HOLD_RELEASE	order	fe5deebf-01c8-4d2f-a1b8-edb89feeed17	{"mode": "SIMPLE", "admin": "jwt", "reason": "HOLD_RELEASE", "hold_id": "a4847dc8-4375-4bb7-9a7b-289ff35eeb1c", "order_id": "fe5deebf-01c8-4d2f-a1b8-edb89feeed17", "product_id": "e74dc626-fec8-49c9-97df-bb69aa9c895d"}	2026-01-11 18:17:33.323679-05
204534f7-96fb-423d-9441-f72223c2fd0d	ORDER_REJECT	order	4ce66377-ebe3-49e5-af31-5a99b11e2aaf	{"mode": "retry", "admin": "admin"}	2026-01-11 20:39:57.270917-05
e246331d-0e05-489c-9902-cfeb5c29c47b	ORDER_REJECT	order	4ce66377-ebe3-49e5-af31-5a99b11e2aaf	{"mode": "cancel", "admin": "admin"}	2026-01-11 20:40:24.152235-05
883cf19c-4e52-41b5-97cd-5148d52115cd	ORDER_MARK_PAID	order	8ef54663-3ac7-48a8-818e-02abdc562b71	{"admin": "admin"}	2026-01-11 20:41:26.498891-05
37c7eacc-4c2c-4066-bf4b-3c632f89c226	ORDER_REJECT	order	82b9599a-2a97-46fe-a20b-99f7abb0337a	{"mode": "cancel", "admin": "admin"}	2026-01-11 20:42:32.326604-05
e62786dd-95ab-459b-aece-e7f07606925f	ORDER_MARK_PAID	order	532c5c9a-2ebe-47b7-a5a5-6e18ac00412f	{"admin": "admin"}	2026-01-11 23:06:39.598851-05
a0f482f7-cb36-44e0-ab4e-a6d4be7950c9	ORDER_MARK_PAID	order	156b1c71-1681-4985-b687-d6c0f766c90b	{"admin": "admin"}	2026-01-12 00:00:48.725499-05
f7ae06df-148e-4245-9531-53c4e1a4167d	ORDER_MARK_PAID	order	893d8513-2d35-47a2-aae4-bd439f723af8	{"admin": "admin"}	2026-01-12 18:41:43.397757-05
151a9fe5-64f4-4a0c-b29e-f48c38dff65f	ORDER_MARK_PAID	order	d9b82098-6550-4fea-8295-b888426246ac	{"admin": "admin"}	2026-01-12 18:49:04.630213-05
99c8b393-ab2d-4497-bbe3-b7ad0740f3ad	ORDER_MARK_PAID	order	1b3dcdba-4ef3-4d06-a5dc-b95b4521c7c0	{"admin": "admin"}	2026-01-12 19:22:53.895166-05
94e4d66d-bd8d-4bdb-9b0f-554aa5768784	ORDER_MARK_PAID	order	68d8e4d5-3029-4e6f-a3c3-11d73deb6016	{"admin": "admin"}	2026-01-12 19:29:01.186177-05
fc3f61be-e5d0-4460-aef1-04df7dc8fc0a	ORDER_MARK_PAID	order	b5624033-16a9-4e15-b96c-4cfdaa96fc23	{"admin": "admin"}	2026-01-12 19:30:02.851996-05
84592f4c-fb83-439b-a457-d14fc1ed3a2a	ORDER_MARK_PAID	order	9cbfd8b1-3a47-4cc2-88cf-3c789071a7dd	{"admin": "admin"}	2026-01-12 20:09:53.579757-05
8ccc21e0-6124-4e2e-8471-73debb5a7f86	ORDER_MARK_PAID	order	232a44f4-5c7d-44f2-8ebf-652213857f45	{"admin": "admin"}	2026-01-12 20:17:52.630344-05
b56ba79a-b7c8-4401-8d7f-f92c18592599	ORDER_MARK_PAID	order	53d15be8-20d5-47fa-be3e-957f21f74573	{"admin": "admin"}	2026-01-12 20:19:30.316698-05
1dab464f-cfd1-4410-a712-82cf1787565c	ORDER_MARK_PAID	order	881a92b1-085a-4282-b877-8c7e6e101133	{"admin": "admin"}	2026-01-12 21:00:33.305617-05
5632f78d-f265-4eef-baeb-2c2f08f09e5d	ORDER_MARK_PAID	order	a1d5e937-8079-46bd-9170-da0d908ddfbe	{"admin": "admin"}	2026-01-12 21:17:10.277307-05
8a31c6d8-4dab-44a5-9aab-798ef671873b	ORDER_MARK_PAID	order	d4f1709d-8bfe-4631-b972-da22f1761fd6	{"admin": "admin"}	2026-01-12 22:26:21.888877-05
00bdacaa-74fc-4259-9b80-5b8957d20bfd	ORDER_MARK_PAID	order	1cd5ad08-b0d8-4fb3-8945-3269b72d9edc	{"admin": "admin"}	2026-01-13 02:06:12.774034-05
11e2bfe7-9198-4499-bc22-8db3c8d0c5ef	ORDER_MARK_PAID	order	076c2e3d-9f76-485b-81b2-a11957d9613a	{"admin": "admin"}	2026-01-13 02:07:28.190067-05
38795fed-9f8a-455b-b226-94952a3993cc	ORDER_MARK_PAID	order	b4f0d722-c929-40b2-a799-8d19a5ad4be2	{"admin": "admin"}	2026-01-13 02:09:25.70467-05
3b65743c-c2df-48e5-92ff-b4d5a59d7471	ORDER_MARK_PAID	order	b3affecf-89c2-44bb-83d3-2e7a35eaf868	{"admin": "admin"}	2026-01-13 02:52:12.118562-05
1793dc4b-18cf-4e1f-a9ce-fe8fd5a181ad	ORDER_MARK_PAID	order	06979977-4ff3-4385-bc6d-2a05e8bd260a	{"admin": "admin"}	2026-01-13 03:06:16.466321-05
d3b5fe9e-ac2a-48a9-91ed-107aa464aaef	ORDER_MARK_PAID	order	a4ebdeb3-9bde-43d2-8071-466b4519fad3	{"admin": "admin"}	2026-01-13 03:21:53.382612-05
d86831b3-8735-4d63-a8d0-c044e83c08d7	ORDER_MARK_PAID	order	4ae1479d-2f09-46fb-8de5-d5741ec6d0bc	{"admin": "admin"}	2026-01-13 03:23:38.604172-05
a0990d73-5ca0-42aa-be35-987c7085c0b1	ORDER_MARK_PAID	order	206df772-74eb-432d-a9e1-29ef2b5a9082	{"admin": "admin"}	2026-01-13 03:28:52.331196-05
46286e4b-04da-40c8-8064-01d7e36f183d	ORDER_MARK_PAID	order	0ace7d3f-fc60-43b2-912a-d287a2307a69	{"admin": "admin"}	2026-01-13 03:35:33.676283-05
1247fdea-b831-4bd8-b600-adb656cd3f6c	ORDER_MARK_PAID	order	7dfb789e-d7f4-4ec6-a0ef-c63da5ab4795	{"admin": "admin"}	2026-01-13 03:41:14.360699-05
106d447c-54f6-4656-a388-797ed39087aa	ORDER_MARK_PAID	order	b0b275b2-8508-49dd-a059-b4d4aa93ada5	{"admin": "admin"}	2026-01-13 03:47:44.748702-05
c6531a5a-1dbd-4a96-919c-62c4f0dee4ee	ORDER_MARK_PAID	order	fe6104b2-c6c4-43f6-b7b9-0b14bb530da8	{"admin": "admin"}	2026-01-13 04:33:54.798318-05
ca22fc06-8896-451a-b35d-881a54bc8290	ORDER_MARK_PAID	order	953c0e3c-4054-4c5e-985c-ed0fbd40e02f	{"admin": "admin"}	2026-01-13 04:51:02.137751-05
f6cf919c-666a-4ea1-b39e-584960ee30dc	ORDER_MARK_PAID	order	c6d9bafb-c624-4cf4-b448-90376d6b0183	{"admin": "admin"}	2026-01-13 05:09:13.529756-05
dd9bf030-5103-4ec4-a941-9be2b8bd11e6	ORDER_MARK_PAID	order	119d2b85-7cc2-4541-999c-606c64cf4cf5	{"admin": "admin"}	2026-01-13 05:18:48.863047-05
f839233f-7019-4c32-8314-3c4e4a418005	ORDER_MARK_PAID	order	5b19d1eb-2c89-4d3a-9cb2-a2c196fe5be5	{"admin": "admin"}	2026-01-13 06:36:39.038311-05
9e9e878c-e98f-40af-9918-4aeae17a11de	ORDER_MARK_PAID	order	db30f1b0-fd31-4574-a936-4253cfc9f460	{"admin": "admin"}	2026-01-13 06:39:45.823981-05
8a6b624b-5b7d-4fcf-a14a-b11d296c0298	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 40}	2026-01-13 06:43:23.867393-05
d6344d34-258c-4264-b44e-5d032a2732e9	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 500}	2026-01-13 06:43:41.261948-05
83a1d623-eab0-4abe-a54f-38a6650f802a	STOCK_HOLD_RELEASE	order	6becd814-5dac-4819-9608-8462cd6728d2	{"qty": 1, "mode": "UNITS", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "units-held-6becd814-5dac-4819-9608-8462cd6728d2", "order_id": "6becd814-5dac-4819-9608-8462cd6728d2", "product_id": "fb9d200f-5b61-42b0-924c-b6338b69b478"}	2026-01-13 06:46:06.3916-05
fe34328f-768e-4946-89d3-abca32ea717e	HOLD_RELEASE_CANCEL_ORDER	order	6becd814-5dac-4819-9608-8462cd6728d2	{"mode": "UNITS", "admin": "jwt", "reason": "HOLD_RELEASE", "hold_id": "units-held-6becd814-5dac-4819-9608-8462cd6728d2", "order_id": "6becd814-5dac-4819-9608-8462cd6728d2", "product_id": "fb9d200f-5b61-42b0-924c-b6338b69b478"}	2026-01-13 06:46:06.3916-05
410aef64-4c5d-41a6-910a-bfa08e5b2f91	STOCK_SIMPLE_SET	product	d6885302-6754-4aa5-8f1d-f676b313efc1	{"sku_key": "metodos_producto_01", "stock_qty": 1000}	2026-01-13 07:24:28.237487-05
98341dc5-2a24-4a1a-be6f-2d940b51b9ce	PRODUCT_NAME_UPDATE	product	6e70c835-667f-4e72-8e01-f4acfcca2553	{"name": "SHOP 03 - Noropayments"}	2026-01-13 07:39:27.408926-05
4bec159d-fb8c-419e-abcd-e19f8750967f	STOCK_SIMPLE_SET	product	6e70c835-667f-4e72-8e01-f4acfcca2553	{"sku_key": "shop_producto_03", "stock_qty": 21}	2026-01-13 07:39:53.678866-05
1b326c14-01d0-4b9c-9c44-04828158c0c5	STOCK_SIMPLE_SET	product	6e70c835-667f-4e72-8e01-f4acfcca2553	{"sku_key": "shop_producto_03", "stock_qty": 100000000}	2026-01-13 07:40:54.130608-05
c66a7c92-4a72-4e6e-aedd-05c2a2517be2	STOCK_SIMPLE_SET	product	6e70c835-667f-4e72-8e01-f4acfcca2553	{"sku_key": "shop_producto_03", "stock_qty": 10}	2026-01-13 07:41:14.262774-05
d5df2a26-acc9-4913-9627-935599dca694	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": null}	2026-01-13 07:53:00.29628-05
bf37f4d2-2219-4e1a-aa4a-d145236ecd95	ORDER_MARK_PAID	order	1a09e8fa-8560-46d8-a6b8-1574625a14c8	{"admin": "admin"}	2026-01-13 08:09:52.288014-05
99cecade-4fc7-4889-8b72-b375ee805341	ORDER_MARK_PAID	order	e2ef5f34-0ce3-4407-b792-d64300462e5c	{"admin": "admin"}	2026-01-13 08:19:03.614778-05
274528f4-971b-4905-9506-362e1a52155c	PRODUCT_STOCK_MODE_UPDATE	product	9bda1a83-fb16-4c3d-b7e6-fb9bfcd0f240	{"stock_mode": "UNITS"}	2026-01-13 08:24:58.919294-05
41bb0e96-b91b-461b-af94-60ce7ed3de81	PRODUCT_STOCK_MODE_UPDATE	product	9bda1a83-fb16-4c3d-b7e6-fb9bfcd0f240	{"stock_mode": "SIMPLE"}	2026-01-13 08:25:16.030487-05
435b81b1-45f2-4f0b-a582-5a487ffb6791	PRODUCT_NAME_UPDATE	product	1206872e-084f-4974-964e-47d337b0fc1d	{"name": "WEB 01 - Landing Page"}	2026-01-13 15:28:37.850076-05
e120ae31-1ab3-496b-86b2-c02c73385357	PRODUCT_DEACTIVATE	product	4466f038-d2e2-41f4-abf4-f8eaf0072070	{"is_active": false}	2026-01-13 15:29:09.88931-05
77591676-565d-4ce8-a3af-8f625d66ed11	PRODUCT_DEACTIVATE	product	dcb24743-16a5-48e5-8930-0fbfde57f05f	{"is_active": false}	2026-01-13 15:29:19.038477-05
984617c0-e37c-49d4-9b03-62b77b082449	PRODUCT_CREATE	product	3ca9f191-d20f-4be0-a50e-e7844ca69a1b	{"name": "WEB - noropayments"}	2026-01-13 15:53:19.000551-05
4225e2bb-ce13-4cb6-a246-87b283c390f1	PRODUCT_DEACTIVATE	product	3ca9f191-d20f-4be0-a50e-e7844ca69a1b	{"is_active": false}	2026-01-13 16:28:17.592158-05
b8f956ad-a23e-4b5a-9bee-089878e47446	PRODUCT_CREATE	product	17007cf3-86ae-460e-bae0-3bcb077ffbb9	{"name": "SHOP - JINX"}	2026-01-13 16:29:09.561076-05
aee85606-7c4f-4616-a4e3-f8a298f65abd	PRODUCT_DEACTIVATE	product	6e70c835-667f-4e72-8e01-f4acfcca2553	{"is_active": false}	2026-01-13 18:04:55.806656-05
4a652eb9-37ea-4d2b-b1b1-40777f80d4d6	PRODUCT_DEACTIVATE	product	e6e3dd7d-a381-4189-9793-1d3deb17b97d	{"is_active": false}	2026-01-13 18:05:02.440266-05
06d495f1-4dbc-4d41-b7c0-581910dc2e01	PRODUCT_DEACTIVATE	product	fb27542f-5680-4cbf-885d-1c95608c2b93	{"is_active": false}	2026-01-13 18:05:04.540365-05
6402eb16-a2dc-4fcc-8693-81514d9b6e69	PRODUCT_DEACTIVATE	product	0022ae53-baaf-4385-8ac4-773cb26a9f22	{"is_active": false}	2026-01-13 18:05:06.39221-05
30d8876e-ae7f-4998-bcb9-04cfc9c38f5b	PRODUCT_DEACTIVATE	product	b32d85eb-3578-43d0-80cd-4e78a92a9af6	{"is_active": false}	2026-01-13 18:05:09.602287-05
e4582f9e-c984-4372-b6b0-e041e7e9c1a3	PRODUCT_DEACTIVATE	product	3c79e48d-667d-4e85-9a55-2148e0a04a92	{"is_active": false}	2026-01-13 18:05:15.193401-05
c4b189f9-dff4-4648-816f-702793df3792	PRODUCT_DEACTIVATE	product	17007cf3-86ae-460e-bae0-3bcb077ffbb9	{"is_active": false}	2026-01-13 18:25:45.169538-05
b79e30d8-5614-47b6-b4e6-1551872b4563	PRODUCT_DEACTIVATE	product	9bda1a83-fb16-4c3d-b7e6-fb9bfcd0f240	{"is_active": false}	2026-01-13 18:26:29.673499-05
ae808134-63a2-4865-89c4-4c3347a19b17	PRODUCT_DEACTIVATE	product	553ed6bb-7fc9-4070-9593-1523a3b92271	{"is_active": false}	2026-01-13 18:26:31.303672-05
b30e5f3a-d4c5-48ab-8896-e6d200091eee	PRODUCT_DEACTIVATE	product	24a8cb01-5177-4d1a-b74c-b220cd8eb005	{"is_active": false}	2026-01-13 18:26:32.345486-05
5a5bd1e6-e4a1-4487-94ea-0e4002384ed6	PRODUCT_CREATE	product	c4a0f5c6-59ac-4959-92a9-77e422e93b60	{"name": "SHOP - Catalinas"}	2026-01-13 18:56:04.381029-05
3535de77-c209-4ef0-b082-84211b387ef5	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "SHOP - 💳 Venta de Tarjetas", "price": 25, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 19:09:45.208759-05
3e48e18f-1b25-4824-a0d7-89d88a06b150	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 11111, "unique_purchase": false}	2026-01-13 19:09:45.237236-05
d23fa765-14f5-42ca-abf9-d9dd46a8bc01	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "SHOP - 💳 Venta de Tarjetas", "price": 25, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": true}	2026-01-13 19:10:14.401604-05
4f29e1c1-3530-496c-91e9-53b0d3d27c1b	STOCK_SIMPLE_SET	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"sku_key": "000001", "stock_qty": null, "unique_purchase": false}	2026-01-15 21:37:45.556936-05
57f1dde3-a653-487b-ab40-1032eef53341	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 11111, "unique_purchase": true}	2026-01-13 19:10:14.446701-05
28292b27-cb42-4bba-bf5f-8784eaf39edf	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "SHOP - 💳 Venta de Tarjetas", "price": 25, "show_stock": false, "stock_mode": "SIMPLE", "unique_purchase": true}	2026-01-13 19:11:05.027486-05
39d8aa3f-be32-47db-919e-9324deaa0099	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 11111, "unique_purchase": true}	2026-01-13 19:11:05.065072-05
bf37c218-a423-4453-ac5c-d500237915ef	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "SHOP - 💳 Venta de Tarjetas", "price": 25, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 19:21:50.674908-05
6b19d187-d7a7-40bb-b847-af15632c4c30	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 12, "unique_purchase": false}	2026-01-13 19:21:50.706689-05
238d8829-fd45-471b-8b56-da2d71ccc2eb	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "SHOP - 💳 Venta de Tarjetas", "price": 25, "show_stock": false, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 19:26:29.665635-05
bc9ab2f5-8ce1-4a8a-b99d-4b154b166592	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": null, "unique_purchase": false}	2026-01-13 19:26:29.704848-05
b0300e75-36eb-49a6-ba61-0ab533502a26	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "SHOP - 💳 Venta de Tarjetas", "price": 25, "show_stock": false, "stock_mode": "SIMPLE", "unique_purchase": true}	2026-01-13 19:27:21.319693-05
6385be49-5a0d-480f-9bee-290b75749780	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 0, "unique_purchase": true}	2026-01-13 19:27:21.35831-05
45dbbbd1-7c58-4e0f-b3e3-c4b1b370ddf6	PRODUCT_UPDATE	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"name": "METODOS - 💳 Venta de Tarjetas", "price": 21, "show_stock": false, "stock_mode": "SIMPLE", "unique_purchase": true}	2026-01-13 19:31:19.861758-05
7b4d739f-4e53-474d-8000-24cd5aabe635	STOCK_SIMPLE_SET	product	e74dc626-fec8-49c9-97df-bb69aa9c895d	{"sku_key": "shop_producto_01", "stock_qty": 0, "unique_purchase": true}	2026-01-13 19:31:19.902885-05
c998ef43-cfee-4a3e-9946-3d2b28c39e78	PRODUCT_UPDATE	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"name": "METODOS - 🔗 Links de CCS Shop", "price": 30121, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 19:47:44.972664-05
88d0aca7-b5d1-415b-91af-7d29bc671c76	STOCK_SIMPLE_SET	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"sku_key": "shop_producto_02", "stock_qty": 121212, "unique_purchase": false}	2026-01-13 19:47:45.043383-05
0d9faa9e-2292-464b-b017-8d2cfa8a9643	PRODUCT_DEACTIVATE	product	c4a0f5c6-59ac-4959-92a9-77e422e93b60	{"is_active": false}	2026-01-13 19:54:11.408917-05
dafdd32b-8429-4d74-87f5-08f00b4f2ee1	PRODUCT_DEACTIVATE	product	8a9e9d02-a1fd-4945-bbfb-f9b69c516c1c	{"is_active": false}	2026-01-13 19:54:12.087574-05
aa52f6bd-1d39-479c-968e-d5a11a8601e4	PRODUCT_DEACTIVATE	product	b6913f61-9d8c-4e4b-b3a5-eb9520f082c3	{"is_active": false}	2026-01-13 19:54:13.369548-05
ab30bd21-a065-436d-9923-85c2511c2a05	PRODUCT_DEACTIVATE	product	3908863f-92cd-4157-b8ec-8379acde503a	{"is_active": false}	2026-01-13 19:54:13.58774-05
5d512dea-e693-4201-bf45-1dfb37d9fa8b	PRODUCT_DEACTIVATE	product	376c7ab6-3c40-4f56-9854-d5c012e9a8fe	{"is_active": false}	2026-01-13 19:54:16.858756-05
847f3795-982d-4974-84b2-5de9d41dc697	PRODUCT_UPDATE	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"name": "SHOP - 🔗 Links de CCS Shop", "price": 90, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 19:55:16.6303-05
9136f629-38b4-4928-b175-ff0861b2267b	STOCK_SIMPLE_SET	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"sku_key": "shop_producto_02", "stock_qty": 99999, "unique_purchase": false}	2026-01-13 19:55:16.680074-05
c382ed06-59b6-416a-9a44-b60c0a0b5e2b	PRODUCT_UPDATE	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"name": "METODOS - 🔗 Links de CCS Shop", "price": 90, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 19:55:57.243712-05
6b8ef7b4-668b-4c1c-a2e9-0a05ed183827	STOCK_SIMPLE_SET	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"sku_key": "shop_producto_02", "stock_qty": 99999, "unique_purchase": false}	2026-01-13 19:55:57.275561-05
2579ee9d-d8c1-48c9-8b42-581ff14541c9	PRODUCT_UPDATE	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"name": "SHOP - 🔗 Links de CCS Shop", "price": 90, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 20:04:42.185043-05
db110e63-6eff-4d2d-9f14-7f678ef66b41	STOCK_SIMPLE_SET	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"sku_key": "shop_producto_02", "stock_qty": 99999, "unique_purchase": false}	2026-01-13 20:04:42.257657-05
2128605e-0ae8-4265-a413-27cdcc9f6e0e	PRODUCT_UPDATE	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"name": "METODOS - 🔗 Links de CCS Shop", "price": 90, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-13 20:42:45.681227-05
afd8e63d-7471-45e7-8bf1-b06166f63425	STOCK_SIMPLE_SET	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"sku_key": "shop_producto_02", "stock_qty": 99999, "unique_purchase": false}	2026-01-13 20:42:45.748483-05
38c56c1d-8ce5-4dc1-b9f0-c5ff236e6288	PRODUCT_DEACTIVATE	product	1e1808fe-866c-4fbb-b84d-49ab02c4e5f8	{"is_active": false}	2026-01-13 20:47:38.44313-05
d4845e3e-cc6b-4184-9604-7621f546a750	PRODUCT_DEACTIVATE	product	4505e5f2-bfd5-40c8-ab48-b6df8e32db33	{"is_active": false}	2026-01-13 20:47:39.212091-05
ab87591b-431e-4b71-9ae7-c36677ab7257	PRODUCT_DEACTIVATE	product	4e31818f-f4cd-4718-8e63-e95c1fc35aa3	{"is_active": false}	2026-01-13 20:47:40.432446-05
426f7294-d532-4b2a-8449-80eec46b6c5e	PRODUCT_DEACTIVATE	product	7c0f3756-9d02-4e49-be74-530628b9806f	{"is_active": false}	2026-01-13 20:47:41.33096-05
3e4e7813-017b-4f12-9996-f53b29f4a28c	PRODUCT_DEACTIVATE	product	ae775ad6-b375-4e02-8c3a-97ebb407e1b9	{"is_active": false}	2026-01-13 20:47:41.970558-05
c2dfcfd9-3398-49c5-9e1e-3bab08ad19b9	PRODUCT_DEACTIVATE	product	c68c2038-5e68-440e-89f0-47a238ba81bd	{"is_active": false}	2026-01-13 20:47:42.576764-05
f9406ae2-063b-41fb-a995-066f4d4e400c	PRODUCT_DEACTIVATE	product	cd21f82c-4061-4478-8011-345ac1e11d96	{"is_active": false}	2026-01-13 20:48:02.002604-05
c644374c-7aa0-497b-ba4c-84c84dcd47a0	PRODUCT_DEACTIVATE	product	ea1de0b9-da38-4747-8c80-6e3ddbcc3039	{"is_active": false}	2026-01-13 20:48:07.839867-05
6ee2e069-46f4-4dd3-9684-847b2e4cebe4	PRODUCT_DEACTIVATE	product	0d67bd4a-c23b-40e5-bc8a-a4f0f9554759	{"is_active": false}	2026-01-13 20:48:19.027507-05
59a2caae-2484-4cf7-b13d-e585060a5daa	PRODUCT_DEACTIVATE	product	470c8a81-abcf-48fb-a9c4-b18438c6efbe	{"is_active": false}	2026-01-13 20:48:21.021179-05
493859a8-9301-4774-a3dd-687339e3620d	PRODUCT_DEACTIVATE	product	ae76b0a6-2ee9-462a-85b6-b20724fcda18	{"is_active": false}	2026-01-13 20:48:22.526367-05
5a23499e-1623-4b75-aa94-b8625e9f1735	PRODUCT_DEACTIVATE	product	bfd454fd-183b-49aa-be5f-a718de3275ac	{"is_active": false}	2026-01-13 20:48:23.943531-05
60ce2e60-6639-413a-8b8a-ecf1c23fee96	PRODUCT_DEACTIVATE	product	e7dca8c6-7276-440e-87f4-51303919dfd8	{"is_active": false}	2026-01-13 20:48:25.627634-05
20b03361-3a44-44c9-b820-8232d3ec3b60	PRODUCT_DEACTIVATE	product	e2cb737b-b327-4c4a-8918-2f457223a830	{"is_active": false}	2026-01-13 20:48:26.629634-05
f46bdf70-470c-4dd7-bc0f-145099188ff8	PRODUCT_DEACTIVATE	product	ded4c4d5-7093-4ab7-a35e-9d75af9fc61e	{"is_active": false}	2026-01-13 20:48:27.695716-05
025f2fd6-c7e5-4ead-a751-9905b0137654	PRODUCT_DEACTIVATE	product	0c27355c-8e30-4f7e-90ac-11d9256ec0c6	{"is_active": false}	2026-01-13 20:48:33.326478-05
ebd706db-d06d-451f-be69-ef938e6bb158	PRODUCT_DEACTIVATE	product	1206872e-084f-4974-964e-47d337b0fc1d	{"is_active": false}	2026-01-13 20:48:34.34373-05
16593f80-c1c3-4a49-9a5b-e09146fa7bf4	PRODUCT_DEACTIVATE	product	308660a9-bc31-458c-9226-be3d466847c5	{"is_active": false}	2026-01-13 20:48:35.205424-05
139565e2-b5b5-4435-9f3e-610124c119d1	PRODUCT_DEACTIVATE	product	e2086656-450d-4c08-9462-b684b4862167	{"is_active": false}	2026-01-13 20:48:37.608532-05
73e9dde8-ae8c-4864-b842-9688038452cf	PRODUCT_DEACTIVATE	product	460e2ae9-f4f4-42ac-994b-0ebd38f92018	{"is_active": false}	2026-01-13 20:48:41.889283-05
182c62d1-4372-4eb8-9d10-21f2c27b4f6b	PRODUCT_NAME_UPDATE	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"name": "VIP - Producto 05"}	2026-01-13 20:48:58.860861-05
c2e62952-a9ba-49f0-8b29-6a0615d9430e	ORDER_MARK_PAID	order	e2d2dd09-db51-4c21-b7e1-c0cacdfa621a	{"admin": "admin"}	2026-01-13 21:28:39.946672-05
a62e6bfd-15e5-4ef9-8eae-6d2d2d1c760d	ORDER_MARK_PAID	order	3b2e4016-89c6-45df-b120-83789ad17a49	{"admin": "admin"}	2026-01-13 21:41:18.420516-05
8d3a96ad-7227-479d-82e1-c48173142c39	PRODUCT_UPDATE	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"name": "🔗 Links de CCS Shop", "price": 90, "show_stock": false, "stock_mode": "SIMPLE", "unique_purchase": true}	2026-01-13 21:45:40.064315-05
e5fcabec-a3c6-432c-8bf4-79111f8134ca	ORDER_MARK_PAID	order	9e68d923-89c0-484f-b38c-1e1313944c9d	{"admin": "admin"}	2026-01-15 21:45:12.271028-05
286737c0-82c3-4608-b48b-b202e37b9412	STOCK_SIMPLE_SET	product	1c81b811-ba5f-474e-ae84-03535202dd71	{"sku_key": "shop_producto_02", "stock_qty": 0, "unique_purchase": true}	2026-01-13 21:45:40.106048-05
0ed6a2f8-c944-458e-84ef-be4e4e5633d4	ORDER_MARK_PAID	order	5ba93a7f-7818-415d-8c2e-54532175db43	{"admin": "admin"}	2026-01-13 22:04:17.610901-05
0debb4bf-2742-4f9e-8258-9d516e49ecd1	PRODUCT_CREATE	product	a627ee3f-ffb8-4ee7-8540-430027d5a90e	{"name": "MUNDO DE CAOS"}	2026-01-13 23:10:38.542357-05
458aa477-a8ed-42c4-ad3f-538b231ec7a8	PRODUCT_CREATE	product	f183f1ae-bd5f-45a7-a229-d2fce3727939	{"name": "noropayments"}	2026-01-13 23:41:18.276877-05
7d1a46c5-50f8-4900-b150-1e7c4feafd16	STOCK_SIMPLE_SET	product	f183f1ae-bd5f-45a7-a229-d2fce3727939	{"sku_key": "000012", "stock_qty": 1, "unique_purchase": true}	2026-01-13 23:41:18.378291-05
d926119c-bd6f-4016-9d24-0284e9b2bc73	PRODUCT_CREATE	product	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	{"name": "gratis"}	2026-01-13 23:50:46.315733-05
aac4b1d6-a4a8-4775-a6e9-979f12d53e33	STOCK_SIMPLE_SET	product	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	{"sku_key": "000013", "stock_qty": 2, "unique_purchase": false}	2026-01-13 23:50:46.405551-05
ec29dbf9-460c-46ff-a5b3-112183c57ce2	ORDER_MARK_PAID	order	b4cc9017-98f6-48e0-be72-a274d4b704ea	{"admin": "admin"}	2026-01-14 00:05:31.002672-05
b3e2daac-f8e3-45b9-bca6-549f57c15020	PRODUCT_CREATE	product	2e75fbd8-5602-4499-a8b8-17825f6ed371	{"name": "too por aca bien"}	2026-01-14 00:31:48.46893-05
6bedf23c-fae4-48bd-8eb3-1a8db6449486	STOCK_SIMPLE_SET	product	2e75fbd8-5602-4499-a8b8-17825f6ed371	{"sku_key": "000014", "stock_qty": 3, "unique_purchase": false}	2026-01-14 00:31:48.579431-05
83e9c497-5cc4-43a8-88fa-868a4bf7eb90	ORDER_MARK_PAID	order	5a8e8f40-fb0f-4ca7-b456-0ab52dceac77	{"admin": "admin"}	2026-01-14 00:34:33.828181-05
963f64fc-82e3-4154-ae58-9f1fde2e4f74	PRODUCT_UPDATE	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"name": "Producto 14", "price": 24, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-14 00:59:34.438363-05
abaed724-662c-4fa3-9361-1b2d00f9cd98	STOCK_SIMPLE_SET	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"sku_key": "000001", "stock_qty": null, "unique_purchase": false}	2026-01-14 00:59:34.470602-05
e2d868cd-304c-4bf5-9ff9-dfed683f6ce0	ORDER_MARK_PAID	order	5b9a7813-1385-4fcc-8fc4-f8894990aeff	{"admin": "admin"}	2026-01-14 03:34:11.172432-05
6a7e2404-aaeb-492a-96a8-6529636b2ffc	ORDER_MARK_PAID	order	9622298a-bad1-461a-8cee-29a07d6ef9d3	{"admin": "admin"}	2026-01-14 03:46:07.179273-05
7882e36a-4fc6-4af1-9664-1a4eb747b5b4	STOCK_HOLD_RELEASE	order	508a36bc-9214-4e28-84c7-e2713f3bb7e4	{"qty": 1, "mode": "UNITS", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "units-held-508a36bc-9214-4e28-84c7-e2713f3bb7e4", "order_id": "508a36bc-9214-4e28-84c7-e2713f3bb7e4", "product_id": "fb9d200f-5b61-42b0-924c-b6338b69b478"}	2026-01-14 03:57:35.145877-05
5274087f-2a2d-45dc-b692-5e1ceee33595	HOLD_RELEASE_CANCEL_ORDER	order	508a36bc-9214-4e28-84c7-e2713f3bb7e4	{"mode": "UNITS", "admin": "jwt", "reason": "HOLD_RELEASE", "hold_id": "units-held-508a36bc-9214-4e28-84c7-e2713f3bb7e4", "order_id": "508a36bc-9214-4e28-84c7-e2713f3bb7e4", "product_id": "fb9d200f-5b61-42b0-924c-b6338b69b478"}	2026-01-14 03:57:35.145877-05
f97a337f-87dd-423f-b3e8-e93639a71c96	PRODUCT_UPDATE	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"name": "Producto 05", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 04:01:53.345384-05
38ecde32-9b4c-4003-bf24-e2d5b24bfd89	STOCK_TEMPLATE_SET	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"delivery_template": "Alfa y Beta"}	2026-01-14 04:10:55.969665-05
6d3dcff4-c814-40ec-9960-431969115674	PRODUCT_UPDATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"name": "Producto 04", "price": 30, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-14 04:23:50.487016-05
e1c6bd5d-428b-41ba-b2f2-e0ae19545cc9	STOCK_SIMPLE_SET	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"sku_key": "000002", "stock_qty": 3, "unique_purchase": false}	2026-01-14 04:23:50.559554-05
75755093-46fa-4124-9df2-da52c0bd1262	PRODUCT_UPDATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"name": "Producto 04", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 04:24:02.875471-05
86b4baf5-3fab-4e05-90e9-b60b823cc648	STOCK_UNITS_UPLOAD	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"sku_key": null, "product_ids": ["11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc"], "failed_count": 0, "inserted_count": 1}	2026-01-14 04:32:03.955665-05
b062a2c9-9e16-4d05-8022-75f90eb60c08	ORDER_MARK_PAID	order	5579e49a-5436-4bf8-8a96-35ae51366cbc	{"admin": "admin"}	2026-01-14 04:33:20.278035-05
f50641fb-dbf7-4d7a-85a2-2adf35a3dda8	STOCK_UNITS_UPLOAD	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"sku_key": null, "product_ids": ["fb9d200f-5b61-42b0-924c-b6338b69b478"], "failed_count": 0, "inserted_count": 1}	2026-01-14 04:34:39.761363-05
7968b1e6-c3d1-4068-9e30-eea384168309	ORDER_MARK_PAID	order	83d97c2c-c3d0-4c1d-942b-b78df4f03085	{"admin": "admin"}	2026-01-14 04:35:24.966431-05
c65e7629-da6f-4a44-a753-c9789d615a45	PRODUCT_UPDATE	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"name": "Producto 05", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 04:36:06.40849-05
6c2bea9b-75e2-4d46-a078-f829895c3273	PRODUCT_UPDATE	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"name": "Producto 05", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 04:36:19.837611-05
51c62d75-6b7c-440d-ba69-db4679b9e753	ORDER_MARK_PAID	order	715880a8-1002-41fe-9e63-7c410c9f143a	{"admin": "admin"}	2026-01-14 04:37:12.783461-05
8b2f6320-f831-4252-90d3-93ee7f2a112e	STOCK_TEMPLATE_SET	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"delivery_template": "🔑 DATOS DE INICIO DE SESIÓN\\n👤 Usuario: {{username}}\\n🔒 Contraseña: {{password}}\\n"}	2026-01-14 04:44:04.58191-05
9d2277cf-83c5-415f-9fc7-56b66532e6c1	ORDER_MARK_PAID	order	b8726a2c-a7fa-43bb-8149-ca8fbebba8f5	{"admin": "admin"}	2026-01-14 04:44:50.792702-05
f7c6b4e2-b96d-4ed0-bae1-403dc3ff152c	STOCK_TEMPLATE_SET	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"delivery_template": "🔑 ACCESO\\n\\n👤 Usuario: junior\\n🔒 Contraseña: noro123\\n🗓 Inicio: 14 de enero\\n⏳ Expira: 14 de febrero"}	2026-01-14 05:20:09.016551-05
1e1703aa-6dca-4c97-9cfc-4981e1b870d9	STOCK_TEMPLATE_SET	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"delivery_template": "🔑 ACCESO\\n\\n👤 Usuario: junior\\n🔒 Contraseña: noro123\\n🗓 Inicio: hoy\\n⏳ Expira: mañana"}	2026-01-14 05:23:08.393034-05
212adc05-c3b3-43e4-9ec2-c0afe48106b7	PRODUCT_UPDATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"name": "Producto 04", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 05:23:10.971362-05
6561580c-7c80-4851-90a7-f22052868329	PRODUCT_UPDATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"name": "Producto 04", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 05:23:12.563956-05
98893d48-e570-4ba2-9461-40d659b538cd	PRODUCT_UPDATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"name": "Producto 04", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 05:23:13.781346-05
5c818d24-c41b-4626-80c6-b41d4e385ad1	PRODUCT_UPDATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"name": "Producto 04", "price": 30, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": false}	2026-01-14 05:23:17.142306-05
03d90e20-3809-4276-91c2-d67ca9c87d86	ORDER_MARK_PAID	order	9fca83d2-fe4a-4f23-bcad-4a8d7d12856c	{"admin": "admin"}	2026-01-14 05:24:39.913274-05
32c74886-b42f-4645-b0cb-739af0c250db	ORDER_MARK_PAID	order	320e2ef5-a5f0-45e0-9310-b6f8a39d7d2d	{"admin": "admin"}	2026-01-14 21:49:49.335026-05
437ec51c-95be-4350-bc1b-6faf38f6793b	ORDER_REJECT	order	7c46c729-a091-4460-bbb3-2280a3fde2f0	{"mode": "retry", "admin": "admin"}	2026-01-14 22:27:35.645657-05
f1b4ab7e-d33d-4b9b-bf64-61cd9eaf6ac0	ORDER_REJECT	order	7c46c729-a091-4460-bbb3-2280a3fde2f0	{"mode": "cancel", "admin": "admin"}	2026-01-14 22:27:52.246659-05
6d5ed8ea-8a32-40dd-ac53-9b2368d09143	ORDER_REJECT	order	7c46c729-a091-4460-bbb3-2280a3fde2f0	{"mode": "retry", "admin": "admin"}	2026-01-14 22:29:22.971115-05
ed7d099f-7943-4cad-8182-4742c0d82bd1	ORDER_REJECT	order	7c46c729-a091-4460-bbb3-2280a3fde2f0	{"mode": "cancel", "admin": "admin"}	2026-01-14 22:29:46.960491-05
ad25bd29-c412-434e-878e-d36fe1093296	ORDER_MARK_PAID	order	70805f36-dfd2-489c-b7e9-5ecbacfb7ce5	{"admin": "admin"}	2026-01-14 22:49:49.054756-05
fb005c00-1e92-4a17-b4b8-07cb434f7a4a	ORDER_MARK_PAID	order	86951483-a3a4-4c20-8129-3a98056098e8	{"admin": "admin"}	2026-01-14 23:51:12.466191-05
1e7acc64-0a71-493c-b91e-b7155dbf7e72	ORDER_MARK_PAID	order	fcc4be28-4650-4f6b-b3d9-7ba47c42a7fd	{"admin": "admin"}	2026-01-15 04:22:09.898347-05
63d7766d-8275-4029-bb14-7fd26e38f568	PRODUCT_UPDATE	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"name": "Producto 14", "price": 24, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-15 21:37:45.172633-05
94f44a22-bb94-4962-9025-7462b247cf72	ORDER_MARK_PAID	order	b72b832d-90b7-496c-9ada-4568a89a8a13	{"admin": "admin"}	2026-01-15 21:46:53.757553-05
c82c57d7-da1c-49e3-a27f-20015ce4b926	ORDER_MARK_PAID	order	8980221b-9b26-41d3-9788-fb5dbd5acd24	{"admin": "admin"}	2026-01-15 22:17:55.334858-05
c9445b7c-cb8a-448f-8b47-524e5c0ad7de	ORDER_REJECT	order	8e51564c-08df-4604-a234-8f6d31941fda	{"mode": "cancel", "admin": "admin"}	2026-01-15 22:22:49.358999-05
88a3c6c2-cf3d-4ddd-a56a-afa75d0c85f6	ORDER_MARK_PAID	order	5a5f2168-d6c4-41f1-927a-7fe85a1d73f4	{"admin": "admin"}	2026-01-15 22:24:50.210284-05
4e4a01ab-8d8e-4c96-9358-35dfd0da2ff3	ORDER_MARK_PAID	order	bcf97d0b-94ad-4de6-9c17-fc99b0f947fc	{"admin": "admin"}	2026-01-15 23:30:11.658461-05
36d7e4ce-1786-453d-a293-010799cf553d	ORDER_MARK_PAID	order	22274fa6-0263-4c56-ad90-2fd8e4412bbb	{"admin": "admin"}	2026-01-15 23:47:00.614913-05
a7e916fd-1033-4411-b510-ddea37280131	ORDER_MARK_PAID	order	dcdc5066-9f1e-47c2-8917-d932e1f5175f	{"admin": "admin"}	2026-01-15 23:54:05.756801-05
0df4e4c1-8642-4933-968d-caae2d336957	ORDER_MARK_PAID	order	3145897c-a86d-4d8b-bef4-479fd4ba5cc3	{"admin": "admin"}	2026-01-16 00:04:02.650101-05
90f85d5d-4992-4345-9593-60195b55a14a	ORDER_MARK_PAID	order	001a6673-e8a5-4e39-8982-446d0c2cc818	{"admin": "admin"}	2026-01-16 05:37:35.491907-05
192d84bc-7a22-42ac-9d11-1375e1cdcea4	ORDER_MARK_PAID	order	a1d329bf-591d-4684-8f8b-0e2799aaabc7	{"admin": "admin"}	2026-01-16 05:46:07.354922-05
1cad4977-6437-4418-abae-9adb37b17fc2	ORDER_MARK_PAID	order	38e58b90-d240-4ad9-99ba-49f56ce98410	{"admin": "admin"}	2026-01-16 06:03:51.377178-05
642926ed-56c0-4150-b852-4079f09e9a25	ORDER_MARK_PAID	order	9014e352-e92e-4fb1-9f34-1d536fd24406	{"admin": "admin"}	2026-01-16 06:24:52.269388-05
e95bc41b-f7b1-4a02-a2d0-888941130b1e	PRODUCT_UPDATE	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"name": "Producto 14", "price": 5, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-16 10:26:12.301827-05
5f488b84-2b18-47ca-b18a-c7104f9e6ef2	STOCK_SIMPLE_SET	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"sku_key": "000001", "stock_qty": null, "unique_purchase": false}	2026-01-16 10:26:12.362314-05
48af2bf0-61ee-402c-b3b5-b3dfa1c7c4d2	ORDER_MARK_PAID	order	1d6b62b6-f031-4b5c-99a5-1c95a4a7028a	{"admin": "admin"}	2026-01-16 10:27:28.944079-05
7584ac3e-6993-4b46-b33b-571956e72e51	ORDER_MARK_PAID	order	93d70572-a8be-4297-98e8-36a611736a8c	{"admin": "admin"}	2026-01-16 10:31:47.077304-05
64beb598-7c2b-4fa9-8463-2bdee345eb46	ORDER_MARK_PAID	order	a97a9b6a-c33d-4360-a643-468c04160c40	{"admin": "admin"}	2026-01-17 02:58:39.253184-05
6868200f-0c28-4949-8242-f3b16a98da1d	PRODUCT_UPDATE	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"name": "Producto 14", "price": 200, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-17 03:33:24.390641-05
b6ee7165-4ec6-4ae2-9400-319c629b50b3	STOCK_SIMPLE_SET	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"sku_key": "000001", "stock_qty": null, "unique_purchase": false}	2026-01-17 03:33:24.45438-05
368e1c1f-c9cc-47cd-8e9d-d6eb5cd8cb03	ORDER_MARK_PAID	order	d40f1101-e7a2-439d-87da-5e02c64c22b8	{"admin": "admin"}	2026-01-17 03:55:28.560776-05
61b7d36f-a00b-40f2-a210-fd6c4915f8f0	ORDER_MARK_PAID	order	e4363019-022a-409c-afd7-0aea2b6fbf5b	{"admin": "admin"}	2026-01-17 05:29:24.130577-05
e23755d0-c684-4887-a0d4-622ee5660dd4	ORDER_MARK_PAID	order	80b3ad1c-327d-450c-a24c-4a03432e628f	{"admin": "admin"}	2026-01-17 05:34:59.432282-05
13b04241-dab8-42d7-8e39-9518fd9a8083	ORDER_MARK_PAID	order	6d08583c-08e0-4eed-ba85-1aa65a153b4d	{"admin": "admin"}	2026-01-17 05:39:32.08415-05
92ab09c0-dca8-4f74-b42f-c6adf5eea54f	ORDER_MARK_PAID	order	bf2a1cdf-9255-4f68-82e1-a63a531407a4	{"admin": "admin"}	2026-01-17 14:11:09.095751-05
14581721-d8ad-49c5-952b-c41d1572925b	ORDER_MARK_PAID	order	b56ddcbf-232c-4ed3-9729-ae0cba292cda	{"admin": "admin"}	2026-01-19 00:23:04.384253-05
2ddb4c0a-7450-4724-b928-59c8a36cf96e	ORDER_MARK_PAID	order	682ddcc5-d84f-45c1-a8bf-c791a44786ec	{"admin": "admin"}	2026-01-19 02:19:44.544142-05
ce7a682a-b2f9-4048-834e-b06254259315	STATS_RESET	stats	\N	{"confirm": "Reset"}	2026-01-19 03:34:24.14659-05
78777d7e-ca26-42b9-90a3-24e7b8e68472	PRODUCT_DEACTIVATE	product	a627ee3f-ffb8-4ee7-8540-430027d5a90e	{"is_active": false}	2026-01-19 04:18:03.406904-05
fd74f365-3a56-47a7-aea1-1ecb197f5446	PRODUCT_DEACTIVATE	product	2e75fbd8-5602-4499-a8b8-17825f6ed371	{"is_active": false}	2026-01-19 04:18:10.717297-05
33cc074f-4434-4543-933a-48983f973dfd	PRODUCT_DEACTIVATE	product	f183f1ae-bd5f-45a7-a229-d2fce3727939	{"is_active": false}	2026-01-19 04:18:12.680434-05
24facacb-9eed-4aa5-9238-5704ba0d2704	PRODUCT_DEACTIVATE	product	2917d506-292d-41e0-9dce-14f4f251bbc5	{"is_active": false}	2026-01-19 04:18:13.75951-05
8eed1581-3689-4f41-82f7-cbbf2595a36e	PRODUCT_DEACTIVATE	product	2656c42a-d164-45a7-a240-ab18ef947b1e	{"is_active": false}	2026-01-19 04:18:24.42492-05
7740396e-67f1-44a6-a0f4-0f4bd0ee0b50	PRODUCT_NAME_UPDATE	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"name": "💳 Venta de Tarjetas"}	2026-01-19 04:20:23.024133-05
6120e508-f9f1-43c0-b19c-57408bfe0dd5	PRODUCT_UPDATE	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"name": "💳 Venta de Tarjetas", "price": 25, "show_stock": true, "stock_mode": "SIMPLE", "unique_purchase": false}	2026-01-19 04:24:28.498922-05
d08fc47a-d413-471b-a124-daa628ba752a	STOCK_SIMPLE_SET	product	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	{"sku_key": "000001", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:24:28.558331-05
9edda69e-5dd7-47f6-92a6-a76d4e226e30	PRODUCT_CREATE	product	4ef04bc1-c3a0-47a1-81c6-f87b79128496	{"name": "🔗 Links de CCS Shop"}	2026-01-19 04:27:41.800782-05
21b251ed-6e55-42ae-91db-637d7c30f562	STOCK_SIMPLE_SET	product	4ef04bc1-c3a0-47a1-81c6-f87b79128496	{"sku_key": "000015", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:27:41.906883-05
5bcba701-b518-4897-b117-caf22cc5cb50	PRODUCT_CREATE	product	b232a5dc-39af-47e2-9851-a0a00d5c9a88	{"name": "🕵️ Foros de Carding"}	2026-01-19 04:29:05.667231-05
145bb108-a668-4645-8235-12f3fada4271	STOCK_SIMPLE_SET	product	b232a5dc-39af-47e2-9851-a0a00d5c9a88	{"sku_key": "000016", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:29:05.740172-05
90b53daf-6d16-4742-9cc2-f0147f1bcd58	PRODUCT_CREATE	product	cc9b1681-086f-4eff-88d1-7bfea1a433e2	{"name": "📣 Paneles SMM"}	2026-01-19 04:30:32.680973-05
310a5476-3854-4cc7-a7ce-c795c4373b79	STOCK_SIMPLE_SET	product	cc9b1681-086f-4eff-88d1-7bfea1a433e2	{"sku_key": "000017", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:30:32.74658-05
9aba8e3e-07dc-468a-b4dc-fe3320aa00be	PRODUCT_CREATE	product	79f4085b-c38a-40de-a4a2-951d1caa0142	{"name": "📩 Paneles SMS"}	2026-01-19 04:31:54.064562-05
eeebd67f-c587-4109-abd8-6cfb1ac74c31	STOCK_SIMPLE_SET	product	79f4085b-c38a-40de-a4a2-951d1caa0142	{"sku_key": "000018", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:31:54.141496-05
ece2d926-cfca-4ff8-be25-9f1aecbae794	PRODUCT_CREATE	product	5e8dd0f9-06a7-472c-98ad-885824e564ad	{"name": "🎁 Paneles Gift Card"}	2026-01-19 04:33:48.123164-05
87606593-69ae-43f1-bf62-9cefc3ae86e9	STOCK_SIMPLE_SET	product	5e8dd0f9-06a7-472c-98ad-885824e564ad	{"sku_key": "000019", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:33:48.20876-05
57631011-96ff-46c0-99ae-972345d4b241	PRODUCT_CREATE	product	968e685b-3967-4268-b7a7-b97d57e125fa	{"name": "🎬 Paneles Streaming"}	2026-01-19 04:36:35.071921-05
ff422095-9786-4216-ab00-70214cecf9fc	STOCK_SIMPLE_SET	product	968e685b-3967-4268-b7a7-b97d57e125fa	{"sku_key": "000020", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:36:35.173855-05
88789624-a4b1-4a14-8f59-65ffe10c9863	PRODUCT_CREATE	product	2acf5ea0-704f-4ca6-9619-a242a2fe2122	{"name": "🎮 Paneles de Juegos"}	2026-01-19 04:40:19.027105-05
b8101deb-6ff4-4be3-91c3-5a5776ee1be3	STOCK_SIMPLE_SET	product	2acf5ea0-704f-4ca6-9619-a242a2fe2122	{"sku_key": "000021", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:40:19.103213-05
a2fa6f12-09fd-4bfe-a7c9-0d85880a4da4	PRODUCT_CREATE	product	d3a83b4d-7b2d-404b-bb5f-c1a8a20bd2dd	{"name": "📧 Paneles de Emails Temporales"}	2026-01-19 04:42:39.770845-05
13a10e8e-1812-413f-be54-5f00a86070a1	STOCK_SIMPLE_SET	product	d3a83b4d-7b2d-404b-bb5f-c1a8a20bd2dd	{"sku_key": "000022", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:42:39.839501-05
4f999ce2-b9f9-4ada-abde-17361ed9e9da	PRODUCT_CREATE	product	8c06f62e-5698-43ad-9848-a843061394df	{"name": "Paneles Mercado Negro"}	2026-01-19 04:44:43.664891-05
9f848f4f-7431-4931-a5cc-b6092d1a979f	STOCK_SIMPLE_SET	product	8c06f62e-5698-43ad-9848-a843061394df	{"sku_key": "000023", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:44:43.727644-05
564b72d1-4150-4839-8bfc-cd502ad0a5be	PRODUCT_CREATE	product	c2a9b2e2-569e-4381-9315-09030bba2827	{"name": "Checkers"}	2026-01-19 04:47:00.907783-05
67a037d5-3299-4d0c-8b1e-9677016a1a54	STOCK_SIMPLE_SET	product	c2a9b2e2-569e-4381-9315-09030bba2827	{"sku_key": "000024", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:47:00.973708-05
b9636118-6040-4ece-bfee-8a3ea6589a72	PRODUCT_CREATE	product	a1fa6385-eea5-4b95-a2b9-f4cd3d02d3aa	{"name": "+120 Grupos de Telegram"}	2026-01-19 04:48:44.989111-05
c4b27bdb-44ad-4ef9-b4a5-f5fb03cc5bae	STOCK_SIMPLE_SET	product	a1fa6385-eea5-4b95-a2b9-f4cd3d02d3aa	{"sku_key": "000025", "stock_qty": null, "unique_purchase": false}	2026-01-19 04:48:45.067266-05
d7e108e2-eaad-4c91-812d-632da66a2434	PRODUCT_CREATE	product	a56ffe4a-3233-4e5e-9700-5cf45f92e9df	{"name": "150 IDS mexicanos (INES)"}	2026-01-19 14:52:26.030509-05
6bce8b68-e614-4797-abfd-b204b73ccd37	STOCK_SIMPLE_SET	product	a56ffe4a-3233-4e5e-9700-5cf45f92e9df	{"sku_key": "000026", "stock_qty": null, "unique_purchase": false}	2026-01-19 14:52:26.137729-05
f3092753-fc6e-4ae9-8686-865f2ce4556b	PRODUCT_CREATE	product	71af3a91-a689-49f4-bb6b-b4afa279bcf4	{"name": "Panel Onlyfans"}	2026-01-19 14:54:48.912411-05
8adf8675-b893-4ea4-a215-784d7033e499	STOCK_SIMPLE_SET	product	71af3a91-a689-49f4-bb6b-b4afa279bcf4	{"sku_key": "000027", "stock_qty": null, "unique_purchase": false}	2026-01-19 14:54:49.009027-05
8d359191-0022-4d39-a866-ff835705b38c	PRODUCT_CREATE	product	3de71e85-4589-4beb-ae58-91d9820b6008	{"name": "Panel SSN y Pasaportes"}	2026-01-19 14:56:14.25381-05
7032e4e0-99ba-4b5f-baef-508b79d731d9	STOCK_SIMPLE_SET	product	3de71e85-4589-4beb-ae58-91d9820b6008	{"sku_key": "000028", "stock_qty": null, "unique_purchase": false}	2026-01-19 14:56:14.319321-05
f9ea18dc-3493-46f0-bb4a-88882f62dc97	PRODUCT_CREATE	product	e90f566c-74be-465d-acb4-2a636fffb149	{"name": "Paneles Worm GPT"}	2026-01-19 15:21:54.112185-05
a22e4b5f-c681-4154-b582-f0cb1fc6f9cd	STOCK_SIMPLE_SET	product	e90f566c-74be-465d-acb4-2a636fffb149	{"sku_key": "000029", "stock_qty": null, "unique_purchase": false}	2026-01-19 15:21:54.177802-05
53f0a221-1b02-4352-a3c3-8a66b325501d	PRODUCT_CREATE	product	d48ce70f-0f4a-4c55-98f1-57c433cb9fba	{"name": "Bin Chat GPT Plus 1 mes"}	2026-01-19 15:40:07.274248-05
2079386d-d8da-4ef8-ae2d-cfd7d4e39dd7	STOCK_SIMPLE_SET	product	d48ce70f-0f4a-4c55-98f1-57c433cb9fba	{"sku_key": "000030", "stock_qty": null, "unique_purchase": false}	2026-01-19 15:40:07.365651-05
e2be5fe8-b876-4ca9-8c14-070fb80cff57	PRODUCT_CREATE	product	bc890533-ee5e-42f0-9c3c-fb5a97a17020	{"name": "Bin - Tango (ve chicas ricas)"}	2026-01-19 15:45:47.381228-05
66d5b26f-555b-4e9d-8c43-309515fa75a7	STOCK_SIMPLE_SET	product	bc890533-ee5e-42f0-9c3c-fb5a97a17020	{"sku_key": "000031", "stock_qty": null, "unique_purchase": false}	2026-01-19 15:45:47.468491-05
afba9e6f-781a-4649-842e-f1f246b428b8	PRODUCT_CREATE	product	026d7d47-d1f9-41ae-98f0-75125583de7f	{"name": "Bin - Vecteezy Anual"}	2026-01-19 15:48:33.242325-05
ca9921ad-a1e3-4cfb-9137-feb5723eea7e	STOCK_SIMPLE_SET	product	026d7d47-d1f9-41ae-98f0-75125583de7f	{"sku_key": "000032", "stock_qty": null, "unique_purchase": false}	2026-01-19 15:48:33.320261-05
fa260f02-114f-46f8-aeb5-9884ce04493a	PRODUCT_DEACTIVATE	product	378be0ae-f326-41cb-930f-8e2bae27ff69	{"is_active": false}	2026-01-19 16:09:56.369323-05
6c9a4a6a-eda2-4b28-a0c8-11901141d256	PRODUCT_DEACTIVATE	product	3c313338-9900-45ad-bd59-fa8ba6d72f6a	{"is_active": false}	2026-01-19 16:09:57.451202-05
131b071a-f349-4a2e-8a8a-4c05bd9ec8b0	PRODUCT_DEACTIVATE	product	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	{"is_active": false}	2026-01-19 16:10:00.643509-05
ca0d258c-2f11-4152-a32c-ed6ce1d2e1dc	PRODUCT_DEACTIVATE	product	d6885302-6754-4aa5-8f1d-f676b313efc1	{"is_active": false}	2026-01-19 16:10:23.763524-05
ac8dfb2d-0c06-4732-a179-55d670f5048f	PRODUCT_NAME_UPDATE	product	d48ce70f-0f4a-4c55-98f1-57c433cb9fba	{"name": "Bin - Chat GPT Plus 1 mes"}	2026-01-19 16:10:36.836297-05
ec12be22-c76d-462d-8995-de261ef49dae	PRODUCT_CREATE	product	b578aeef-b76a-472f-9221-1784fe43d590	{"name": "Bin - Motion Array 1 mes"}	2026-01-19 16:14:00.183512-05
c162f9ed-8861-4361-9fda-617d261c1e58	STOCK_SIMPLE_SET	product	b578aeef-b76a-472f-9221-1784fe43d590	{"sku_key": "000033", "stock_qty": null, "unique_purchase": false}	2026-01-19 16:14:00.275588-05
09a38aa9-fc0c-4b30-8e9b-fdc07b435037	PRODUCT_CREATE	product	86e1c777-9975-489d-aa62-56e86cca7f1b	{"name": "BIN - Wix 1 mes"}	2026-01-19 16:15:36.850401-05
d59c1088-b00d-46d2-b2a4-6ef4b6791caa	STOCK_SIMPLE_SET	product	86e1c777-9975-489d-aa62-56e86cca7f1b	{"sku_key": "000034", "stock_qty": null, "unique_purchase": false}	2026-01-19 16:15:36.9213-05
a2ba0115-b074-46f3-9047-c81083c2ff04	PRODUCT_NAME_UPDATE	product	86e1c777-9975-489d-aa62-56e86cca7f1b	{"name": "Bin - Wix 1 mes"}	2026-01-19 16:16:33.014535-05
699b8b39-02dc-47e4-947e-9928e2e9ba4c	PRODUCT_CREATE	product	bd88dd59-1004-4158-86f6-7b3b18a27d37	{"name": "Shein Con CCS"}	2026-01-19 16:17:54.401367-05
2c85bc19-bb0a-4fac-be7c-f6cc354d8f9a	STOCK_SIMPLE_SET	product	bd88dd59-1004-4158-86f6-7b3b18a27d37	{"sku_key": "000035", "stock_qty": null, "unique_purchase": false}	2026-01-19 16:17:54.480281-05
3d6a2f59-a9bf-4fab-8847-433760a388a3	PRODUCT_CREATE	product	62d5158d-b1f9-41a0-8435-7056fc32219a	{"name": "Aliexpress Con CCS"}	2026-01-19 16:19:10.676906-05
2d69a801-015a-4cba-864a-42c6b690a071	STOCK_SIMPLE_SET	product	62d5158d-b1f9-41a0-8435-7056fc32219a	{"sku_key": "000036", "stock_qty": null, "unique_purchase": false}	2026-01-19 16:19:10.762155-05
40a7184b-3fd3-4cea-b303-ff43badc5609	PRODUCT_CREATE	product	a190a60d-ac58-4623-9fe4-70cd785384a0	{"name": "Bin - CHAT GPT 1 EURO"}	2026-01-19 16:21:54.908378-05
62dff2a6-06d8-4a33-8434-2e2bff2dbae9	STOCK_SIMPLE_SET	product	a190a60d-ac58-4623-9fe4-70cd785384a0	{"sku_key": "000037", "stock_qty": null, "unique_purchase": false}	2026-01-19 16:21:55.004609-05
cf6ee6f0-19a5-45bc-8ee1-ad257ac47b42	PRODUCT_CREATE	product	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	{"name": "Curso | Carding y Bineo"}	2026-01-19 16:57:22.088953-05
e26e0a82-d730-4623-94ad-f1c95f480d3f	STOCK_SIMPLE_SET	product	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	{"sku_key": "000038", "stock_qty": 1, "unique_purchase": true}	2026-01-19 16:57:22.212785-05
089ab1e6-4999-4f9c-9691-cb1409ea988d	PRODUCT_DEACTIVATE	product	fb9d200f-5b61-42b0-924c-b6338b69b478	{"is_active": false}	2026-01-19 16:58:06.683092-05
b25fced8-2d4c-4eba-a664-0e14e60c65db	PRODUCT_DEACTIVATE	product	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"is_active": false}	2026-01-19 16:58:07.687821-05
7be4db88-632c-473e-8e48-637e63aacf77	ORDER_MARK_PAID	order	b3181d55-5568-45b1-813c-6f82eece73ea	{"admin": "admin"}	2026-01-19 17:16:08.990894-05
76809fa3-c313-41d6-beaa-490990da5a1c	PRODUCT_CREATE	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"name": "shubaka"}	2026-01-19 18:10:15.052389-05
2a3da11a-12eb-484a-b9cb-4a26b74a4d5d	ORDER_MARK_PAID	order	2fdf1dce-ad23-4636-bd99-157e6fe26c31	{"admin": "admin"}	2026-01-19 19:07:02.994866-05
725fe258-8ae1-4eea-a79f-6439ad9016ec	ORDER_REJECT	order	ebe4e1e3-5a94-4a21-962d-92fd58ac5588	{"mode": "cancel", "admin": "admin"}	2026-01-19 19:13:19.594386-05
8a1e78eb-79e3-4c1b-979e-ed6009faa7af	ORDER_REJECT	order	09645fbd-e39f-4e26-9e0e-c0ed3b9b65b0	{"mode": "cancel", "admin": "admin"}	2026-01-20 08:43:33.473333-05
972dc3dd-9abb-4ff1-b9b4-277f7eff212f	ORDER_REFUND	order	2fdf1dce-ad23-4636-bd99-157e6fe26c31	{"admin": "admin", "amount": 50, "refund_type": "FULL", "commission_refund": 2.5}	2026-01-20 16:32:05.356722-05
c3c3c315-e1eb-4b91-b84e-2f952b8b374c	ORDER_REFUND	order	b3181d55-5568-45b1-813c-6f82eece73ea	{"admin": "admin", "amount": 50, "refund_type": "FULL", "commission_refund": 10}	2026-01-20 16:33:59.239691-05
0b0d72c5-49f0-46e2-8785-3e0da19988a5	ORDER_REJECT	order	a819c0be-1988-4a11-88c5-4a61a3ec144d	{"mode": "cancel", "admin": "admin"}	2026-01-20 18:19:27.51199-05
7b4c19e1-35d5-442d-8169-9e792c982f7e	STOCK_HOLD_RELEASE	product_stock_hold	86257d7d-e9ad-42f3-be5b-f30d0c30a882	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "86257d7d-e9ad-42f3-be5b-f30d0c30a882", "order_id": "a819c0be-1988-4a11-88c5-4a61a3ec144d", "product_id": "86b71c5c-f34e-4c90-a069-8f9befd5d8ac"}	2026-01-20 18:42:01.270229-05
a6da5a94-90a0-49ae-83c0-aabbe9a9f74d	STOCK_HOLD_RELEASE	product_stock_hold	c87e0fd6-c2a0-48c7-8494-cee774f6456e	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "c87e0fd6-c2a0-48c7-8494-cee774f6456e", "order_id": "ebe4e1e3-5a94-4a21-962d-92fd58ac5588", "product_id": "86b71c5c-f34e-4c90-a069-8f9befd5d8ac"}	2026-01-20 18:42:05.64375-05
850f3552-163a-46fb-9eac-4f4897b13732	STOCK_HOLD_RELEASE	product_stock_hold	6d413ec5-3506-42a8-b95d-39167b569a71	{"qty": 1, "mode": "SIMPLE", "admin": "jwt", "reason": "ADMIN_MANUAL_RELEASE", "hold_id": "6d413ec5-3506-42a8-b95d-39167b569a71", "order_id": "09645fbd-e39f-4e26-9e0e-c0ed3b9b65b0", "product_id": "86b71c5c-f34e-4c90-a069-8f9befd5d8ac"}	2026-01-20 18:42:10.327293-05
4fd60b4c-deca-45a8-b6d1-d3d282b841d0	STOCK_UNITS_ADD	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"sku_key": "000039", "payload_key": "{\\"duration_unit\\":\\"months\\",\\"duration_value\\":\\"1\\",\\"notes\\":\\"Pantalla: Noro\\\\nPin: 1806\\\\n\\\\nGracias por tu compra disfrutala.\\\\nDisfrutala.\\",\\"password\\":\\"Noro123.\\",\\"title\\":undefined,\\"username\\":\\"noropayments\\"}"}	2026-01-20 19:45:06.843238-05
f55e826b-6e8d-4b6c-8e63-18d83c100abf	PRODUCT_NAME_UPDATE	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"name": "Pantalla Netflix 1 Mes"}	2026-01-20 19:46:38.958892-05
fb2ddb36-563b-4e14-80fe-b8f776361032	ORDER_MARK_PAID	order	eaf4147b-df75-4526-84d3-bfacd62cd2d5	{"admin": "admin"}	2026-01-20 19:48:44.655399-05
94d77ca7-2c0a-43e1-87eb-3f0d14a16eff	STOCK_UNITS_ADD	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"sku_key": "000039", "payload_key": "{\\"duration_unit\\":\\"months\\",\\"duration_value\\":\\"2\\",\\"notes\\":\\"faofp vpe\\\\nvwevoe\\\\n\\\\n\\\\nwevewvwee\\",\\"password\\":\\"ewfwefew\\",\\"title\\":undefined,\\"username\\":\\"fefewfew\\"}"}	2026-01-20 19:56:53.778556-05
7e0a363d-b633-4aaa-9df4-69cbf4ee5de6	STOCK_UNITS_ADD	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"sku_key": "000039", "payload_key": "{\\"duration_unit\\":\\"months\\",\\"duration_value\\":\\"3\\",\\"notes\\":undefined,\\"password\\":\\"cwew\\",\\"title\\":undefined,\\"username\\":\\"fweewcew\\"}"}	2026-01-20 19:57:03.365152-05
f3a43ace-6c14-4a31-b753-ea79b8701cc7	STOCK_UNITS_ADD	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"sku_key": "000039", "payload_key": "{\\"duration_unit\\":\\"months\\",\\"duration_value\\":\\"1\\",\\"notes\\":undefined,\\"password\\":\\"efwfew\\",\\"title\\":undefined,\\"username\\":undefined}"}	2026-01-20 19:57:14.002413-05
67a6c822-dcbe-4ad3-90b2-c7ae44d0df2e	ORDER_MARK_PAID	order	6ad04204-d54e-4c2a-9f41-c9e040fe9708	{"admin": "admin"}	2026-01-20 23:02:15.173391-05
7874b1c3-e1b4-453c-8661-08b34e37a245	ORDER_MARK_PAID	order	c54f7f4c-afe1-4e3c-9186-b40f84092948	{"admin": "admin"}	2026-01-21 13:09:24.557687-05
70cf4663-e8fa-4c49-b850-41c4087dc66a	ORDER_REFUND	order	c54f7f4c-afe1-4e3c-9186-b40f84092948	{"admin": "admin", "amount": 90, "refund_type": "FULL", "commission_refund": 49.5}	2026-01-21 17:52:17.925675-05
7b2d43f9-5ad5-4a99-81db-86e4d9233194	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": "vuelto", "admin_telegram_id": 7621162350}	2026-01-21 20:32:40.579691-05
153276c0-e09a-43db-bd90-1ca6080a1b29	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 30, "reason": "vuelto", "admin_telegram_id": 7621162350}	2026-01-21 20:34:36.266187-05
4bda929d-f665-48d0-957e-6b0026fdda84	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -10, "reason": "pago metodo", "admin_telegram_id": 7621162350}	2026-01-21 20:58:49.130808-05
fcd71bd4-1d65-4a3a-ab8e-7adfdde28070	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 21:37:03.8662-05
ba531e19-9f20-470e-9c30-5b04f477b344	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2.5, "reason": "Te lo has ganaodo por el reto", "admin_telegram_id": 7621162350}	2026-01-21 21:38:15.700995-05
46ad721b-87da-4dd2-839a-dead8973a9be	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": "Ganado", "admin_telegram_id": 7621162350}	2026-01-21 21:40:20.550096-05
a8ff8685-b6b4-44b4-a27d-21749d8773a0	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": "retiro por incumplimiento", "admin_telegram_id": 7621162350}	2026-01-21 22:04:26.641433-05
779e0f50-2ffb-4858-a331-3f3a442e8fae	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -5, "reason": "retiro", "admin_telegram_id": 7621162350}	2026-01-21 22:05:16.611195-05
d6eea128-f6b8-4c00-a8fa-0732c35645b0	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -35, "reason": "retiro", "admin_telegram_id": 7621162350}	2026-01-21 22:05:41.020506-05
b4f36f0c-cf46-4672-8e5f-927d9c282485	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -1.2, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 22:15:52.654894-05
87a3412f-8aba-472b-bbdd-397eac76b2f7	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 22:21:08.437607-05
328206a6-941b-4ff2-ba2f-9c31a165d6f3	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -2500, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 22:22:03.444597-05
aa739a48-538b-4a18-8ad6-980e670377b1	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 22:23:09.735081-05
aa325026-0362-4864-9936-232e4c4b19a8	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -1000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 22:49:05.480582-05
c43e35f5-1a98-4747-9eed-93a4fa975727	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -12, "reason": "cobro", "admin_telegram_id": 7621162350}	2026-01-21 22:53:27.548761-05
e7f31851-7b4b-4ce7-8b71-33281aa56f7b	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 500, "reason": "regalo", "admin_telegram_id": 7621162350}	2026-01-21 22:53:45.913748-05
74012d4e-3816-4373-b95a-10632295324f	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 100, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 23:18:31.705676-05
09593a17-7b8d-4863-887e-d815d01e629a	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 5000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-21 23:19:58.765389-05
86e1910c-c9d8-4f73-9317-2a91b94c4b06	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 200, "reason": null, "invoice_id": "c649ad54-5d3b-47f5-9c30-87e77f14563e", "admin_telegram_id": 7621162350}	2026-01-21 23:20:37.540573-05
7a29dfbd-f1ce-4f6f-8e6b-c223bcc2f503	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 200, "reason": "pago por metodo 1", "invoice_id": "422a2487-f8d3-46ad-a3ce-4e456fc0eca4", "admin_telegram_id": 7621162350}	2026-01-21 23:27:51.412471-05
de9f7fc3-fba8-4e16-a387-7a62323e321b	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 118.6, "reason": null, "invoice_id": "252d9d8b-dcb5-4ede-876d-b4ba53f3cec5", "admin_telegram_id": 7621162350}	2026-01-21 23:29:09.259868-05
22a3dd3c-5209-4bea-a50a-fe0ca53b7530	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 118.6, "reason": null, "invoice_id": "6586471c-5e40-42ce-8ddf-6645991471a3", "admin_telegram_id": 7621162350}	2026-01-21 23:38:26.685421-05
34baf1d5-e5b6-46da-99ce-fa6eea13e597	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 200, "reason": null, "invoice_id": "c7da512c-f088-4503-8d48-d7d8f5fd122f", "admin_telegram_id": 7621162350}	2026-01-22 00:13:34.354846-05
3053a663-af0e-408d-82b0-dcceb694b335	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 01:49:17.216606-05
0b0c8921-ef6d-44fa-bdc1-2cbab14581fd	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 100, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 02:36:18.560659-05
72a5d4c9-6f94-47c4-8ca5-2cc319a74087	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 4000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 02:36:34.515313-05
82037a9b-4de6-4b38-b461-5445fa4f18a9	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -500, "reason": "Descuento", "admin_telegram_id": 7621162350}	2026-01-22 03:34:00.182439-05
c4a0ef10-c4eb-4f39-9270-ba332a7ab10d	ORDER_REFUND	order	eaf4147b-df75-4526-84d3-bfacd62cd2d5	{"admin": "admin", "amount": 10, "refund_type": "FULL", "commission_refund": 0}	2026-01-22 03:41:15.935333-05
ecc34cce-451b-4ab1-96bf-2ad24a8e312f	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 5000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 04:13:42.404754-05
d4c4a424-fb29-4c43-8734-98825168bfb1	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 04:23:40.996779-05
d4343727-8246-4ffa-b055-2e4e8426a03b	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 100, "reason": null, "invoice_id": "892069bc-4d0d-4748-9c6b-734d3df8c0a7", "admin_telegram_id": 7621162350}	2026-01-22 04:24:23.238061-05
4d9fa3a1-7775-4802-9256-1663eeca5f1a	STATS_RESET	stats	\N	{"confirm": "Reset"}	2026-01-22 04:32:46.052078-05
e8d362d2-eea5-49cc-aac5-6b6fcdf1c9d2	PRODUCT_UPDATE	product	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"name": "Pantalla Netflix 1 Mes", "price": 1000, "show_stock": true, "stock_mode": "UNITS", "unique_purchase": true}	2026-01-22 04:36:13.251971-05
cb282d0b-59d1-4ddf-8d58-095a4b1328fa	ORDER_MARK_PAID	order	7240aff5-8793-4a4c-9853-be8d74646ff0	{"admin": "admin"}	2026-01-22 04:39:31.52521-05
dfbdd6f7-14e4-49fb-be81-222016f20dbd	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": "toma una captura de esta pantalla y paga, luego vas y compras el metodo que quieras, y cuando te pidan captura envias esta.", "invoice_id": "8bd64133-d483-48b1-8de9-b6fb6505a704", "admin_telegram_id": 7621162350}	2026-01-22 05:22:44.961958-05
7f93f39f-b081-4c46-9257-c905059793f8	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1, "reason": null, "invoice_id": "733d25a1-53fe-4572-bc55-a8e9927a239c", "admin_telegram_id": 7621162350}	2026-01-22 05:46:16.79764-05
79123f5b-fcbe-42fc-bd37-bc7faefe0096	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20000, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 06:43:06.449214-05
f64f07f1-435d-4015-9660-7d756cc860c1	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1000, "reason": null, "invoice_id": "8b499814-f444-4d68-a2bf-d8ac6f31c5e4", "admin_telegram_id": 7621162350}	2026-01-22 06:43:38.818881-05
78190d92-b9f5-45ed-92dd-7ad6146caf31	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1000, "reason": null, "invoice_id": "ca42ef90-22fa-4be2-bf90-1fe75781f535", "admin_telegram_id": 7621162350}	2026-01-22 06:46:08.919087-05
c5c8469a-91dd-479f-9e39-442572d13996	ORDER_MARK_PAID	order	6358641d-4366-4a80-8e95-a83d33345b22	{"admin": "admin"}	2026-01-22 16:49:42.983449-05
3a0d9125-d322-4efb-b37f-3e0d9b470bc1	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 17900, "reason": null, "invoice_id": "cfbc9b3c-5abd-4bab-a753-cd0b70d0088c", "admin_telegram_id": 7621162350}	2026-01-22 17:19:12.704142-05
cceff767-445a-4211-add3-955e7469dc32	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 80, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 17:26:06.959186-05
762022a9-2212-4d77-b822-c3c57d237e55	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": -141.25, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 17:41:15.78153-05
08b02f6e-b6b9-4a24-8c38-a18a488b52b9	ORDER_REFUND	order	6358641d-4366-4a80-8e95-a83d33345b22	{"admin": "admin", "amount": 45, "refund_type": "FULL", "commission_refund": 2.25}	2026-01-22 17:42:23.028818-05
fa87109f-cb63-4a1d-afba-51da2fcb02fa	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 5, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 17:44:21.04908-05
b26b0f12-e300-484e-a58f-d53a74e8d146	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 31, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 17:44:32.365741-05
c34928d5-7cf4-498e-a170-bd1958eeb266	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 100, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 18:02:26.128705-05
0c198ff8-2795-4359-8f47-814fc1327d20	ORDER_REFUND	order	7240aff5-8793-4a4c-9853-be8d74646ff0	{"admin": "admin", "amount": 1000, "refund_type": "FULL", "commission_refund": 200}	2026-01-22 18:44:30.033203-05
cafbead8-1fc9-490b-b954-cb96a41a80e4	ORDER_MARK_PAID	order	858cc7a0-5d40-495d-b86a-3c1be85ef3a7	{"admin": "admin"}	2026-01-22 20:06:17.980021-05
8f6c8e91-f64b-4bca-9eba-584ca88ca6f9	ORDER_MARK_PAID	order	f3b0ca11-9add-4a99-b52a-60a344ebb8d4	{"admin": "admin"}	2026-01-22 20:07:53.614324-05
9d22b2b1-121e-4f41-945c-4d2347a018df	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 200, "reason": "", "admin_telegram_id": 7621162350}	2026-01-22 20:50:49.854429-05
6e3801ba-9948-496b-9006-72a2993e0e9b	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": null, "invoice_id": "743fde48-1d2a-49a6-b1d3-497f3a7c2e7c", "admin_telegram_id": 7621162350}	2026-01-22 23:32:11.470046-05
5b0fd7b8-a5ed-48af-8f3b-40badbb6aa99	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": "hola", "invoice_id": "58ecba30-b759-4d5f-a567-57fb9a0d7403", "admin_telegram_id": 7621162350}	2026-01-23 00:07:26.837705-05
e1b0b818-17f2-4442-acad-84cac1c9309f	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": "hola", "invoice_id": "91234c96-a8e1-473f-bb47-e954feef0453", "admin_telegram_id": 7621162350}	2026-01-23 00:08:45.355243-05
2820b567-c7c4-4610-9a12-a7c25b43c8e2	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 20, "reason": null, "invoice_id": "0b0c07d2-0654-4bac-808c-0de480949875", "admin_telegram_id": 7621162350}	2026-01-23 02:40:04.363501-05
1591a299-3862-47b4-8327-f34040f0582b	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 10, "reason": "metodo", "invoice_id": "e736a617-455c-4084-9040-145adf599339", "admin_telegram_id": 7621162350}	2026-01-23 02:45:11.70411-05
70c36ae0-7fb1-473e-bad8-0c4bec5819a2	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 1, "reason": "metodo", "invoice_id": "b94726e5-9a3e-4382-8b24-5063601042c3", "admin_telegram_id": 7621162350}	2026-01-23 02:45:35.606767-05
e6d50d72-8887-4212-a8bc-c6832816aae4	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 100, "reason": "metodo", "admin_telegram_id": 7621162350}	2026-01-23 02:48:38.259104-05
302d0bd6-3631-49fd-9a4a-f184003147f8	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "7c45f297-7595-4485-b23f-de7bc6850289", "admin_telegram_id": 7621162350}	2026-01-23 02:51:20.066032-05
d21bcdb3-2644-49a5-93b7-fbd1f5e0e9d2	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "af02b083-6bd4-491f-ba0a-6a5bde9841e3", "admin_telegram_id": 7621162350}	2026-01-23 02:51:39.992646-05
3efbeca4-edb1-4510-877c-143ab1175543	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "a3678765-ea87-49d3-9814-96da6648523d", "admin_telegram_id": 7621162350}	2026-01-23 02:55:58.776204-05
e3e17b2f-392b-4a36-ab93-922ec8f2042e	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "fefb3a5d-54db-4d97-a8c1-b485fb9a71c2", "admin_telegram_id": 7621162350}	2026-01-23 02:56:20.754409-05
829606c4-228b-4f64-b06f-dfb507b5950c	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "b7eed700-f119-457f-a72d-19494a9f52ef", "admin_telegram_id": 7621162350}	2026-01-23 02:56:43.350331-05
a723912a-0bf5-4ac9-9b93-72c2abe4ea94	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "306741dc-ff0e-4360-8cdc-83f705a61948", "admin_telegram_id": 7621162350}	2026-01-23 03:01:09.44921-05
3ce3d3cb-a8f4-4ae4-8084-b5408fd94487	AFFILIATE_ADJUSTMENT	affiliate	e5d3d7c3-8387-42ad-8563-bc49fed0c017	{"amount": 122, "reason": "", "admin_telegram_id": 7621162350}	2026-01-23 03:04:29.840832-05
a1dd3d3d-02c3-49e2-91a9-5fc76b71c7ee	AFFILIATE_INVOICE_CREATE	affiliate	e5d3d7c3-8387-42ad-8563-bc49fed0c017	{"amount": 5, "reason": null, "invoice_id": "c0a11e8f-af96-4a72-98bb-dd58f24690c5", "admin_telegram_id": 7621162350}	2026-01-23 03:04:41.11391-05
714831e7-2592-4e68-9320-9788ee7585fc	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "0811d458-9477-45f3-a40d-2f020d5abceb", "admin_telegram_id": 7621162350}	2026-01-23 03:17:30.74038-05
4c5b22ab-ebd4-4a1e-be54-bc880518b751	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "bd99bac0-ab5a-4ef7-9b60-d2ed2a525ce7", "admin_telegram_id": 7621162350}	2026-01-23 03:21:38.204411-05
7478c499-f34e-48f5-bd90-8aaccdcb6a84	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "359ebf58-01f0-48be-b9f9-0be90f6127fa", "admin_telegram_id": 7621162350}	2026-01-23 03:21:54.789119-05
eb1066fa-8990-46eb-ae3c-79d17fad8ba2	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 21, "reason": null, "invoice_id": "eec3c3a4-5c48-454a-b539-39f8b9a753a8", "admin_telegram_id": 7621162350}	2026-01-23 03:22:20.974683-05
780b53e9-db3f-4bc6-b60f-22c0d7f61c5f	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "398b43d6-8697-4277-9139-05806b7168a0", "admin_telegram_id": 7621162350}	2026-01-23 03:32:14.893501-05
5bebbdf1-b114-4adc-b4d0-c2b3b48cf8d1	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 2, "reason": null, "invoice_id": "0e5ebcb2-0864-4b4c-9cc5-0d7087ff1e64", "admin_telegram_id": 7621162350}	2026-01-23 03:33:07.353234-05
da05e83c-974a-4e19-b817-00a2e23e5ca7	PRODUCT_CREATE	product	be24d2a3-4e9b-4766-864b-4fe946dc1a65	{"name": "netflix"}	2026-01-23 05:35:08.125637-05
5f21c8da-8f57-4361-8e19-670009927fc0	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 50, "reason": null, "invoice_id": "ef6d5fc4-900f-4388-9ace-9bbf014b85e9", "admin_telegram_id": 7621162350}	2026-01-23 08:21:10.498588-05
be1ba2ce-9d37-465f-8ddd-977c5c4c7f2d	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 50, "reason": null, "invoice_id": "64eb73de-38b5-4863-a43d-0468faa43c1b", "admin_telegram_id": 7621162350}	2026-01-23 08:24:03.57901-05
3486129e-ae6f-46b0-83bb-e74a517bd9d5	AFFILIATE_INVOICE_CREATE	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 50, "reason": null, "invoice_id": "6c61250c-8228-41c0-a7bd-affcd2d2fbc5", "admin_telegram_id": 7621162350}	2026-01-23 08:31:19.046142-05
0d202ca0-2328-43f8-a3e5-8b001a6ce545	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 10, "reason": "Regalo", "admin_telegram_id": 7621162350}	2026-01-23 22:47:41.417005-05
80e7cf8a-1da2-4b98-b912-094b48af14d0	AFFILIATE_ADJUSTMENT	affiliate	0252c270-fe08-467b-810a-3a3d3841d112	{"amount": 50, "reason": "", "admin_telegram_id": 7621162350}	2026-01-23 23:18:21.894704-05
\.


--
-- Data for Name: broadcasts; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.broadcasts (id, segment, product_id, destination, message_text, status, sent_at, created_at, image_path, image_filename, image_mime, buttons, saved) FROM stdin;
\.


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.cart_items (id, cart_id, product_id, qty, created_at, updated_at, unit_price_usd, total_price_usd) FROM stdin;
97cec2a5-57a3-463e-831c-4109888e1957	59c6ea1b-27ad-47d3-8e0d-15714a41418e	e74dc626-fec8-49c9-97df-bb69aa9c895d	4	2026-01-10 13:33:26.002551-05	2026-01-10 13:39:16.524954-05	25.00	100.00
aa14e1d5-8421-4304-ab9d-41b6971b5742	e1dcd060-ceea-4f5f-9ad3-2d53737e9052	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	1	2026-01-20 16:37:24.585318-05	2026-01-20 16:37:24.585318-05	50.00	50.00
28af3c31-3f26-4fa3-9894-5ced05bcd0f3	78477d92-0463-4005-adcb-2d5be34db788	2e75fbd8-5602-4499-a8b8-17825f6ed371	3	2026-01-14 00:32:33.319721-05	2026-01-14 00:32:42.370777-05	0.00	0.00
c6c81552-ea03-4c31-b7c4-122d8442f81a	53120264-4bb2-4b13-b349-89b63e6ee8fe	2917d506-292d-41e0-9dce-14f4f251bbc5	2	2026-01-14 23:21:45.630011-05	2026-01-14 23:21:48.281613-05	22.00	44.00
a390ce94-4bc0-4f88-a88e-a6b7807f8615	64b96179-d86e-44ad-9944-574fa9daff0b	d6885302-6754-4aa5-8f1d-f676b313efc1	15	2026-01-17 02:56:57.070695-05	2026-01-17 02:57:25.925073-05	15.00	225.00
4c2a2f55-763d-4f7b-b216-a6b9b508486b	f1d93cc5-6973-4c2c-93d8-fa7190fdb6d0	2656c42a-d164-45a7-a240-ab18ef947b1e	3	2026-01-15 22:23:22.78184-05	2026-01-15 22:23:24.575494-05	24.00	72.00
a5e12e18-52b4-42c5-9831-a3cdeb184f3d	1b5d03c2-fb95-4505-92e9-3d5750f1f68d	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	2	2026-01-16 10:26:35.623241-05	2026-01-16 10:26:37.667694-05	5.00	10.00
55e67c33-a9ae-43d4-8af5-7038f7c45811	d1dba0f5-ce55-49f7-8770-aa44d024b1a6	d3a83b4d-7b2d-404b-bb5f-c1a8a20bd2dd	1	2026-01-22 07:24:13.699199-05	2026-01-22 07:24:13.699199-05	15.00	15.00
ade1cc42-2b4b-44b6-b147-afb2dd5fe4fc	7feb827f-2149-4805-adc0-67f9564ff39a	2656c42a-d164-45a7-a240-ab18ef947b1e	5	2026-01-17 05:33:47.999507-05	2026-01-17 05:34:01.406525-05	24.00	120.00
3a0c5404-8706-4777-ac36-5947e781796b	9b0b1eee-38a7-436a-8152-f34e7eabf237	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 03:50:27.0896-05	2026-01-09 03:50:27.0896-05	25.00	25.00
745044f8-ad77-4dc6-89f2-0a1cdb99c757	9b0b1eee-38a7-436a-8152-f34e7eabf237	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-09 03:50:44.145293-05	2026-01-09 03:50:44.145293-05	30.00	30.00
cd6a3d39-e70c-44de-8d75-406b8a92db28	e8648c53-7194-47c9-9e3c-42c3d4677c34	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 11:04:29.154717-05	2026-01-09 11:04:29.154717-05	25.00	25.00
096af031-be75-41ab-a9ea-21a333fce868	e98ec545-8577-40df-baa2-ba5ae32e2deb	2656c42a-d164-45a7-a240-ab18ef947b1e	5	2026-01-17 05:27:43.572861-05	2026-01-17 05:27:49.927875-05	24.00	120.00
5a852023-6cce-45d0-9aa6-f718dbdc0cc2	d1dba0f5-ce55-49f7-8770-aa44d024b1a6	cc9b1681-086f-4eff-88d1-7bfea1a433e2	1	2026-01-22 07:25:02.342323-05	2026-01-22 07:25:02.342323-05	15.00	15.00
7bd4693e-af78-4c1d-845d-eb1bb6b78d1c	d96d2776-8dad-433d-b525-038976a536dd	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 12:11:23.446519-05	2026-01-09 12:11:23.446519-05	25.00	25.00
23eeef9c-3264-40b7-87d1-eb6f98a61935	a542ec2c-33b6-4852-9d55-383df0a0d8b1	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	3	2026-01-17 13:34:05.406204-05	2026-01-17 13:34:18.85302-05	200.00	600.00
c2382376-2808-4b98-b7b1-f868d9538ef3	41a85211-b003-47ef-9bcd-84579ea84281	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	1	2026-01-19 18:26:03.457347-05	2026-01-19 18:26:03.457347-05	50.00	50.00
795566ee-16a9-4d4f-aa94-e5ec57334a58	437e699d-2ef3-4fa6-9214-b3cc0655d08e	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 12:15:21.492668-05	2026-01-09 12:15:21.492668-05	25.00	25.00
d9323178-12d5-4b8e-a0d2-4a99012bc319	89886da6-08a8-4029-8bc8-ca4d630dd0a3	e74dc626-fec8-49c9-97df-bb69aa9c895d	2	2026-01-10 14:21:20.362136-05	2026-01-10 14:21:22.300544-05	25.00	50.00
848da60a-8bca-499f-a750-1a5ba23a4524	b6168e61-44d1-49e1-b67c-aafdb91d8f8e	1c81b811-ba5f-474e-ae84-03535202dd71	3	2026-01-09 12:21:44.128559-05	2026-01-09 12:21:52.484195-05	30.00	90.00
bd5e3487-9688-4a1a-bfd4-aad87c58872c	d6cef8d8-fe9c-43a2-aa97-928fc049f1a4	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-09 12:28:35.300096-05	2026-01-09 12:28:35.300096-05	30.00	30.00
0613a62d-1034-419f-a41a-b035ac675139	24bbc1db-0c8d-4e72-b42a-04e562e9ea6b	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-09 12:37:11.016685-05	2026-01-09 12:37:11.016685-05	30.00	30.00
435ae470-3153-4c3a-a6ba-870c03a3d60d	24bbc1db-0c8d-4e72-b42a-04e562e9ea6b	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 12:37:17.774084-05	2026-01-09 12:37:17.774084-05	25.00	25.00
1fdd7d51-fb78-49a3-80cc-7b924c01c127	7f8fee1e-f0da-49e2-b63a-91a769b22298	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 13:10:53.262221-05	2026-01-09 13:10:53.262221-05	25.00	25.00
17aa2fb3-0997-4682-8bec-73ad57ab391c	bb4d7037-d339-44a6-bb25-47a2ad41b726	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-09 13:14:26.83439-05	2026-01-09 13:14:26.83439-05	25.00	25.00
a3df8e36-a357-417a-9040-0717295acea5	2d636f5e-bc5c-4c16-8c70-bd1a6659a144	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-09 13:32:06.841915-05	2026-01-09 13:32:06.841915-05	30.00	30.00
f0c4e57c-4302-4535-b2b7-f843e0e33786	8bc05b8b-5e88-41c1-86d8-ac4e03175b3a	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-10 10:54:34.540915-05	2026-01-10 10:54:34.540915-05	30.00	30.00
4398c5e1-ef39-4d8b-a576-b1d0d18ce0af	8bc05b8b-5e88-41c1-86d8-ac4e03175b3a	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-10 10:54:40.968394-05	2026-01-10 10:54:40.968394-05	25.00	25.00
386fca0e-cb01-4487-b76f-610c364024d2	5ee1d78e-90e0-4877-90fe-6a33c6a7b3c8	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-10 11:32:43.9676-05	2026-01-10 11:32:43.9676-05	25.00	25.00
f55dbe2b-5344-4abd-9d25-dca9de9ac16e	5ee1d78e-90e0-4877-90fe-6a33c6a7b3c8	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-10 11:32:50.306046-05	2026-01-10 11:32:50.306046-05	30.00	30.00
4ac7fe3a-36bd-4b65-ac50-213dfdb85aed	5d07a128-4abb-44c7-bb2c-1b086c862693	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	2	2026-01-10 12:37:59.079824-05	2026-01-10 12:38:01.240292-05	24.00	48.00
7481120e-e1af-4581-add5-66ecb504f409	89886da6-08a8-4029-8bc8-ca4d630dd0a3	1c81b811-ba5f-474e-ae84-03535202dd71	1	2026-01-10 14:21:52.817073-05	2026-01-10 14:21:52.817073-05	30.00	30.00
ded52d77-bf23-435d-be0c-d5a823c85a88	5d07a128-4abb-44c7-bb2c-1b086c862693	e74dc626-fec8-49c9-97df-bb69aa9c895d	3	2026-01-10 12:37:34.49857-05	2026-01-10 12:38:18.326307-05	25.00	75.00
f40d897b-c6b9-407b-a84e-c3666e222a36	3179dba2-ffa3-49fe-8ccd-78a85986c21c	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	1	2026-01-11 00:55:27.216609-05	2026-01-11 00:55:27.216609-05	30.00	30.00
d35edc5f-118e-4040-a7e1-7befe34e246f	11cbd4f5-82c9-463e-96c5-c2f9df003f37	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-10 21:33:42.742182-05	2026-01-10 21:33:45.051318-05	30.00	60.00
d97c977b-e17c-431c-99a4-b58d8c07b306	3179dba2-ffa3-49fe-8ccd-78a85986c21c	fb9d200f-5b61-42b0-924c-b6338b69b478	2	2026-01-11 00:55:43.29915-05	2026-01-11 00:55:44.720125-05	30.00	60.00
bf76e866-761c-4a69-81a5-f9585417e3a4	6609f176-7e2f-44a0-bbb2-66d9e787b27d	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-10 22:16:01.330059-05	2026-01-10 22:16:03.371472-05	30.00	60.00
98c5be8d-4682-45d5-b38a-20e2e5a0c59d	a0cbc02a-3983-46ab-a669-ad0f75ad2690	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-10 22:25:55.129922-05	2026-01-10 22:25:57.133394-05	30.00	60.00
e0838dbf-103e-41f3-8251-66c6babca302	5c342d2e-58fb-4bdb-9c53-1dd0df392e1e	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	1	2026-01-10 22:29:13.449263-05	2026-01-10 22:29:13.449263-05	30.00	30.00
a30a56c4-fe02-4744-8773-cfbe9a0da1b1	e62a8dcd-5fc5-4e76-a7d5-99df8e9581d9	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-10 23:11:43.496985-05	2026-01-10 23:11:45.552265-05	30.00	60.00
22a2a5e8-07be-44be-8ce3-0df073bd90d4	ef2d90fc-0c76-403d-9ce3-bc56d32bbfec	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-10 23:58:45.355677-05	2026-01-10 23:58:46.910056-05	30.00	60.00
d602344b-7d4c-441f-bc5d-bf1cfd32f138	318d04f5-d44c-4f96-b1c3-324c8f7addb6	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-11 00:35:14.105223-05	2026-01-11 00:35:15.907089-05	30.00	60.00
c255bbb1-d888-41f7-87d6-61dcaa7e08e5	318d04f5-d44c-4f96-b1c3-324c8f7addb6	fb9d200f-5b61-42b0-924c-b6338b69b478	2	2026-01-11 00:35:22.429889-05	2026-01-11 00:35:24.413961-05	30.00	60.00
d9034027-6a85-49ba-b45a-4e1b8b5fadf7	0470540b-46a4-4e0d-b1cb-1e66cba1474d	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-11 01:20:18.114507-05	2026-01-11 01:20:20.064648-05	30.00	60.00
9709832f-1b61-497c-97ef-0a147e78a0b6	0470540b-46a4-4e0d-b1cb-1e66cba1474d	fb9d200f-5b61-42b0-924c-b6338b69b478	2	2026-01-11 01:20:28.72888-05	2026-01-11 01:20:30.095725-05	30.00	60.00
71f525a3-2f83-487d-a87b-4909d8627a68	90f6890b-f53d-49cd-81d1-0cae5bf93a91	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	1	2026-01-11 01:24:30.921571-05	2026-01-11 01:24:30.921571-05	30.00	30.00
ff6a6bbb-d8ae-4116-b2dc-218f8ce9689c	90f6890b-f53d-49cd-81d1-0cae5bf93a91	fb9d200f-5b61-42b0-924c-b6338b69b478	1	2026-01-11 01:24:42.42096-05	2026-01-11 01:24:42.42096-05	30.00	30.00
2da24f03-cebb-4dd0-95b2-c09cb8b68695	d8534d3a-e493-4821-89e2-c0657a2e95d6	fb9d200f-5b61-42b0-924c-b6338b69b478	2	2026-01-11 01:51:42.797308-05	2026-01-11 02:09:14.689064-05	30.00	60.00
5e40d80c-8163-4d91-803e-cf091f530c45	d8534d3a-e493-4821-89e2-c0657a2e95d6	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	2	2026-01-11 02:09:21.957976-05	2026-01-11 02:09:23.555254-05	30.00	60.00
963dd9ab-1bac-40fa-99f9-28bbc04376b0	a0b30c46-cd9f-49e7-a7e4-96d0e52ad229	e74dc626-fec8-49c9-97df-bb69aa9c895d	3	2026-01-11 20:25:57.414216-05	2026-01-11 20:26:01.258539-05	25.00	75.00
e3a5ce16-8175-4cb8-aa31-8b0f5d22f279	93154c71-a808-455b-8032-f5e6b404545c	e74dc626-fec8-49c9-97df-bb69aa9c895d	4	2026-01-11 04:03:41.375109-05	2026-01-11 04:03:47.930056-05	25.00	100.00
8a85189c-5d75-4619-802a-8ff19aa5fbf3	ecfd5819-1c69-43af-9965-ec6e86ae009c	fb9d200f-5b61-42b0-924c-b6338b69b478	1	2026-01-11 05:14:29.24532-05	2026-01-11 05:14:29.24532-05	30.00	30.00
f22e722d-1fb2-42c0-b3a0-6bcee91c5dc8	5fde7ad3-108f-4cb0-a738-2b07ee6bf6e2	e74dc626-fec8-49c9-97df-bb69aa9c895d	1	2026-01-11 14:33:06.290143-05	2026-01-11 14:33:06.290143-05	25.00	25.00
68279d10-c6ca-4982-825a-877923289247	0f3f18eb-bc17-4f00-86ce-de5c8c829f53	e74dc626-fec8-49c9-97df-bb69aa9c895d	2	2026-01-11 23:59:31.405711-05	2026-01-11 23:59:33.435614-05	25.00	50.00
3c81cc0a-1963-4f57-94fe-295eaf0c4788	0f3f18eb-bc17-4f00-86ce-de5c8c829f53	fb9d200f-5b61-42b0-924c-b6338b69b478	3	2026-01-11 23:59:41.880323-05	2026-01-11 23:59:46.027344-05	30.00	90.00
6b790616-784a-4a6b-a4d4-a37f7d221976	e0d881c2-a65f-4a99-8b92-38c1ed64547e	e74dc626-fec8-49c9-97df-bb69aa9c895d	2	2026-01-12 20:18:35.802812-05	2026-01-12 20:18:38.589935-05	25.00	50.00
de9f26bd-797f-41f5-a220-7633ede69912	c3a2838c-3956-4321-a9a7-ba23a2ccc47d	e74dc626-fec8-49c9-97df-bb69aa9c895d	4	2026-01-13 04:31:03.502138-05	2026-01-13 04:32:14.140947-05	25.00	100.00
8adc0c79-8e7d-40e4-bc35-a11183356937	8bbdcebf-abe4-4ec8-90a8-d2a13b38e420	e74dc626-fec8-49c9-97df-bb69aa9c895d	5	2026-01-13 04:48:02.844063-05	2026-01-13 04:48:38.172451-05	25.00	125.00
760eb0ce-fdfd-4617-aa45-29e0284f0855	ef6ad49b-fb70-4ba1-a0b7-abf5fb4856fb	e74dc626-fec8-49c9-97df-bb69aa9c895d	5	2026-01-13 05:03:18.697539-05	2026-01-13 05:03:29.026143-05	25.00	125.00
b544a074-35e9-4cd4-bf37-1d0e86e861c4	f4d417d9-e270-476b-a3f2-f3f1aef5c225	e74dc626-fec8-49c9-97df-bb69aa9c895d	4	2026-01-13 05:17:06.084269-05	2026-01-13 05:17:11.375977-05	25.00	100.00
6babed35-c966-43a4-aebe-620a630b7288	9bdcb08e-fa25-412c-8d20-dea4206a2a14	e74dc626-fec8-49c9-97df-bb69aa9c895d	4	2026-01-13 05:19:32.38935-05	2026-01-13 05:19:37.083424-05	25.00	100.00
0636461b-c3e0-47c3-9108-3ac8e379ab7a	d05ff6c1-7850-467b-a331-312ea69254b6	e74dc626-fec8-49c9-97df-bb69aa9c895d	2	2026-01-13 06:38:04.046174-05	2026-01-13 06:38:05.783055-05	25.00	50.00
26bece5e-2998-4789-a2c4-092093d84acb	53120264-4bb2-4b13-b349-89b63e6ee8fe	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	2	2026-01-14 23:21:35.238211-05	2026-01-14 23:21:37.771509-05	24.00	48.00
2f461498-2148-4f3e-870a-c609254243d2	53120264-4bb2-4b13-b349-89b63e6ee8fe	fb9d200f-5b61-42b0-924c-b6338b69b478	2	2026-01-14 23:22:09.453878-05	2026-01-14 23:22:11.623444-05	30.00	60.00
8b9e6217-dc6a-4a57-baff-f2aa3ab8d364	d905fb9c-301a-4f1d-9fd8-adb082d3c4e0	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	2	2026-01-14 23:48:55.325196-05	2026-01-14 23:48:57.427231-05	24.00	48.00
dbb921e5-abaa-44a2-8737-4d0ff3620c6c	664d235b-9c01-4a69-87da-c8d223e57808	1c81b811-ba5f-474e-ae84-03535202dd71	3	2026-01-13 08:07:41.587243-05	2026-01-13 08:08:26.247431-05	30.00	90.00
82be504c-ac19-4df3-bd5d-7764ff1b2141	d905fb9c-301a-4f1d-9fd8-adb082d3c4e0	a627ee3f-ffb8-4ee7-8540-430027d5a90e	2	2026-01-14 23:49:23.228546-05	2026-01-14 23:49:24.721133-05	10.00	20.00
332f3a60-85b3-4db5-a0f5-5cbb4b83fdff	d905fb9c-301a-4f1d-9fd8-adb082d3c4e0	378be0ae-f326-41cb-930f-8e2bae27ff69	2	2026-01-14 23:49:37.147193-05	2026-01-14 23:49:38.596729-05	18.00	36.00
026b1d29-98c4-43b1-862d-2c4e00e47fc3	d8b776ed-c3ed-4b8a-b101-21419ddc7529	a627ee3f-ffb8-4ee7-8540-430027d5a90e	5	2026-01-16 10:30:27.622183-05	2026-01-16 10:30:38.601274-05	10.00	50.00
cfcd1da5-43ea-47d5-991c-6b0a935d88aa	6a3bfde2-3e3f-41b7-89b4-1868bc84f9ff	1c81b811-ba5f-474e-ae84-03535202dd71	5	2026-01-13 21:34:03.200148-05	2026-01-13 21:40:16.344085-05	90.00	450.00
9e8fee41-a2ac-425f-be51-418e21b2e9c9	abec7e0f-e567-42f0-82cd-6b4153757e9d	2656c42a-d164-45a7-a240-ab18ef947b1e	5	2026-01-17 05:31:23.739417-05	2026-01-17 05:31:35.296535-05	24.00	120.00
566ac12d-3eed-49b2-b9e1-306c25baf6b5	7b3725d9-4daf-417d-aee9-18dcd2d9cf42	d6885302-6754-4aa5-8f1d-f676b313efc1	5	2026-01-13 21:57:30.777782-05	2026-01-13 22:03:19.639258-05	15.00	75.00
a13cb684-dacc-4d88-9e6f-6f4f88206ae5	34a170d4-099a-4753-93d5-fbc159edd79c	fb9d200f-5b61-42b0-924c-b6338b69b478	3	2026-01-17 05:38:34.069788-05	2026-01-17 05:38:36.868555-05	30.00	90.00
20bf4294-d29a-4743-8c96-075cc2122028	78477d92-0463-4005-adcb-2d5be34db788	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	2	2026-01-14 00:07:22.911667-05	2026-01-14 00:07:24.860162-05	0.00	0.00
63bb49dc-39d7-407d-8612-b7aedbb41dc6	a7116ff9-d043-4e42-9ace-8c55b04ad20a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	3	2026-01-17 14:01:58.832881-05	2026-01-17 14:02:01.944958-05	200.00	600.00
ef4f3193-d475-405b-97dc-f58ab4da857a	d1dba0f5-ce55-49f7-8770-aa44d024b1a6	2acf5ea0-704f-4ca6-9619-a242a2fe2122	1	2026-01-22 07:24:39.177188-05	2026-01-22 07:24:39.177188-05	15.00	15.00
\.


--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.carts (id, telegram_id, status, created_at, updated_at) FROM stdin;
b6168e61-44d1-49e1-b67c-aafdb91d8f8e	7621162350	CHECKED_OUT	2026-01-09 12:15:36.128216-05	2026-01-09 12:22:34.921072-05
d8b776ed-c3ed-4b8a-b101-21419ddc7529	7949394998	CHECKED_OUT	2026-01-16 10:26:47.386424-05	2026-01-16 10:30:58.615834-05
d6cef8d8-fe9c-43a2-aa97-928fc049f1a4	7621162350	CHECKED_OUT	2026-01-09 12:22:34.921072-05	2026-01-09 12:29:24.509385-05
6609f176-7e2f-44a0-bbb2-66d9e787b27d	7621162350	CHECKED_OUT	2026-01-10 21:34:19.423374-05	2026-01-10 22:19:57.846548-05
24bbc1db-0c8d-4e72-b42a-04e562e9ea6b	7621162350	CHECKED_OUT	2026-01-09 12:29:24.509385-05	2026-01-09 12:37:33.954818-05
41a85211-b003-47ef-9bcd-84579ea84281	8547565029	CHECKED_OUT	2026-01-17 14:02:06.324179-05	2026-01-19 18:26:32.247777-05
c1bc1a3e-e426-4ad1-b813-bf6ef217cfd4	7949394998	CHECKED_OUT	2026-01-07 05:27:02.253693-05	2026-01-07 05:37:41.809251-05
0f3f18eb-bc17-4f00-86ce-de5c8c829f53	7621162350	CHECKED_OUT	2026-01-11 20:26:12.348981-05	2026-01-12 00:00:06.334611-05
04ba7070-ce9a-45dc-bff0-70452f805a30	7949394998	CHECKED_OUT	2026-01-07 05:39:33.443587-05	2026-01-07 05:39:37.090557-05
7f8fee1e-f0da-49e2-b63a-91a769b22298	7621162350	CHECKED_OUT	2026-01-09 12:37:33.954818-05	2026-01-09 13:11:18.460363-05
78477d92-0463-4005-adcb-2d5be34db788	7621162350	CHECKED_OUT	2026-01-13 22:03:23.514557-05	2026-01-14 00:32:55.384197-05
42676d0b-7235-4b67-a3a4-55d8cbb297b9	7949394998	CHECKED_OUT	2026-01-07 05:42:59.338174-05	2026-01-07 05:43:04.868626-05
a0cbc02a-3983-46ab-a669-ad0f75ad2690	7621162350	CHECKED_OUT	2026-01-10 22:19:57.846548-05	2026-01-10 22:27:23.028649-05
6dd997b2-c11d-4baf-a304-15f4ef4e1fd3	7949394998	CHECKED_OUT	2026-01-07 05:55:40.762768-05	2026-01-07 05:55:46.156941-05
bb4d7037-d339-44a6-bb25-47a2ad41b726	7621162350	CHECKED_OUT	2026-01-09 13:11:18.460363-05	2026-01-09 13:15:41.850534-05
e55be56b-c59e-4b11-b6fa-2e03997f7402	7949394998	CHECKED_OUT	2026-01-07 06:14:26.671287-05	2026-01-07 06:14:32.651187-05
5c342d2e-58fb-4bdb-9c53-1dd0df392e1e	7621162350	CHECKED_OUT	2026-01-10 22:27:23.028649-05	2026-01-10 22:29:47.379554-05
0778d219-1aaa-400c-a4cd-41c9508f274f	7949394998	CHECKED_OUT	2026-01-07 06:33:10.366734-05	2026-01-07 06:33:14.096371-05
0a204cb0-0d59-4a29-9cfa-3931ae9ade05	7621162350	CHECKED_OUT	2026-01-07 05:31:51.57449-05	2026-01-07 13:52:46.256126-05
2d636f5e-bc5c-4c16-8c70-bd1a6659a144	7621162350	CHECKED_OUT	2026-01-09 13:15:41.850534-05	2026-01-09 13:32:15.972573-05
e0d881c2-a65f-4a99-8b92-38c1ed64547e	7621162350	CHECKED_OUT	2026-01-12 00:00:06.334611-05	2026-01-12 20:18:45.411047-05
360f551c-b768-4a09-b886-1e4d87b38673	7949394998	CHECKED_OUT	2026-01-07 15:41:33.810663-05	2026-01-07 15:41:48.321143-05
e62a8dcd-5fc5-4e76-a7d5-99df8e9581d9	7621162350	CHECKED_OUT	2026-01-10 22:29:47.379554-05	2026-01-10 23:11:55.628047-05
2ffd0a5a-1a24-4af1-9e80-a1a2590dae6a	7621162350	CHECKED_OUT	2026-01-07 16:46:52.072316-05	2026-01-07 16:46:56.7481-05
ea8fd20a-d6ed-4e96-a700-548d58d685bf	8547565029	ACTIVE	2026-01-19 18:26:32.247777-05	2026-01-19 18:26:32.247777-05
664d235b-9c01-4a69-87da-c8d223e57808	7621162350	CHECKED_OUT	2026-01-13 05:19:43.982402-05	2026-01-13 08:08:45.128058-05
8bc05b8b-5e88-41c1-86d8-ac4e03175b3a	7621162350	CHECKED_OUT	2026-01-09 13:32:15.972573-05	2026-01-10 10:55:04.035109-05
ef2d90fc-0c76-403d-9ce3-bc56d32bbfec	7949394998	CHECKED_OUT	2026-01-10 14:22:10.323213-05	2026-01-11 00:00:06.49829-05
abec7e0f-e567-42f0-82cd-6b4153757e9d	8547565029	CHECKED_OUT	2026-01-17 02:57:32.469543-05	2026-01-17 05:31:39.907927-05
c3a2838c-3956-4321-a9a7-ba23a2ccc47d	7621162350	CHECKED_OUT	2026-01-12 20:18:45.411047-05	2026-01-13 04:32:41.286849-05
cdda64c8-80c4-414d-b600-f5b91e596d7c	7621162350	CHECKED_OUT	2026-01-07 23:14:29.189891-05	2026-01-08 01:23:09.824899-05
318d04f5-d44c-4f96-b1c3-324c8f7addb6	7949394998	CHECKED_OUT	2026-01-11 00:00:06.49829-05	2026-01-11 00:35:37.868547-05
5ee1d78e-90e0-4877-90fe-6a33c6a7b3c8	7621162350	CHECKED_OUT	2026-01-10 10:55:04.035109-05	2026-01-10 11:33:14.559573-05
9b0b1eee-38a7-436a-8152-f34e7eabf237	7621162350	CHECKED_OUT	2026-01-08 01:23:09.824899-05	2026-01-09 03:51:07.432985-05
e8648c53-7194-47c9-9e3c-42c3d4677c34	7621162350	CHECKED_OUT	2026-01-09 03:51:07.432985-05	2026-01-09 11:04:36.795678-05
e1dcd060-ceea-4f5f-9ad3-2d53737e9052	7949394998	CHECKED_OUT	2026-01-16 10:30:58.615834-05	2026-01-20 16:37:37.209733-05
3179dba2-ffa3-49fe-8ccd-78a85986c21c	7949394998	CHECKED_OUT	2026-01-11 00:35:37.868547-05	2026-01-11 00:55:49.441077-05
53120264-4bb2-4b13-b349-89b63e6ee8fe	7949394998	CHECKED_OUT	2026-01-13 06:38:22.791878-05	2026-01-14 23:22:35.206539-05
8bbdcebf-abe4-4ec8-90a8-d2a13b38e420	7621162350	CHECKED_OUT	2026-01-13 04:32:41.286849-05	2026-01-13 04:48:49.947814-05
aea9a531-e75d-4679-86a8-d6bf315a0649	7621162350	CHECKED_OUT	2026-01-09 11:04:36.795678-05	2026-01-09 11:36:10.774877-05
5d07a128-4abb-44c7-bb2c-1b086c862693	7621162350	CHECKED_OUT	2026-01-10 11:33:14.559573-05	2026-01-10 12:38:26.555333-05
0470540b-46a4-4e0d-b1cb-1e66cba1474d	7949394998	CHECKED_OUT	2026-01-11 00:55:49.441077-05	2026-01-11 01:20:44.426905-05
d96d2776-8dad-433d-b525-038976a536dd	7621162350	CHECKED_OUT	2026-01-09 11:36:10.774877-05	2026-01-09 12:11:55.446426-05
437e699d-2ef3-4fa6-9214-b3cc0655d08e	7621162350	CHECKED_OUT	2026-01-09 12:11:55.446426-05	2026-01-09 12:15:36.128216-05
90f6890b-f53d-49cd-81d1-0cae5bf93a91	7949394998	CHECKED_OUT	2026-01-11 01:20:44.426905-05	2026-01-11 01:24:52.961101-05
7feb827f-2149-4805-adc0-67f9564ff39a	8547565029	CHECKED_OUT	2026-01-17 05:31:39.907927-05	2026-01-17 05:34:09.44487-05
ef6ad49b-fb70-4ba1-a0b7-abf5fb4856fb	7621162350	CHECKED_OUT	2026-01-13 04:48:49.947814-05	2026-01-13 05:03:38.944002-05
d8534d3a-e493-4821-89e2-c0657a2e95d6	7949394998	CHECKED_OUT	2026-01-11 01:24:52.961101-05	2026-01-11 02:09:29.595382-05
59c6ea1b-27ad-47d3-8e0d-15714a41418e	7621162350	CHECKED_OUT	2026-01-10 12:38:26.555333-05	2026-01-10 14:17:26.474726-05
d1dba0f5-ce55-49f7-8770-aa44d024b1a6	7949394998	CHECKED_OUT	2026-01-20 16:37:37.209733-05	2026-01-22 07:25:20.029-05
d905fb9c-301a-4f1d-9fd8-adb082d3c4e0	7949394998	CHECKED_OUT	2026-01-14 23:22:35.206539-05	2026-01-14 23:49:45.633763-05
89886da6-08a8-4029-8bc8-ca4d630dd0a3	7949394998	CHECKED_OUT	2026-01-07 23:54:08.147127-05	2026-01-10 14:22:10.323213-05
93154c71-a808-455b-8032-f5e6b404545c	7949394998	CHECKED_OUT	2026-01-11 02:09:29.595382-05	2026-01-11 04:04:01.379978-05
11cbd4f5-82c9-463e-96c5-c2f9df003f37	7621162350	CHECKED_OUT	2026-01-10 14:17:26.474726-05	2026-01-10 21:34:19.423374-05
f4d417d9-e270-476b-a3f2-f3f1aef5c225	7621162350	CHECKED_OUT	2026-01-13 05:03:38.944002-05	2026-01-13 05:17:21.553887-05
ecfd5819-1c69-43af-9965-ec6e86ae009c	7949394998	CHECKED_OUT	2026-01-11 04:04:01.379978-05	2026-01-11 05:14:33.909975-05
334b13bb-59ad-4e00-ad22-50721f445365	7949394998	ACTIVE	2026-01-22 07:25:20.029-05	2026-01-22 07:25:20.029-05
6a3bfde2-3e3f-41b7-89b4-1868bc84f9ff	7621162350	CHECKED_OUT	2026-01-13 08:08:45.128058-05	2026-01-13 21:40:21.670647-05
a0b30c46-cd9f-49e7-a7e4-96d0e52ad229	7621162350	CHECKED_OUT	2026-01-10 23:11:55.628047-05	2026-01-11 20:26:12.348981-05
34a170d4-099a-4753-93d5-fbc159edd79c	8547565029	CHECKED_OUT	2026-01-17 05:34:09.44487-05	2026-01-17 05:38:43.188518-05
64b96179-d86e-44ad-9944-574fa9daff0b	8547565029	CHECKED_OUT	2026-01-17 02:56:57.070695-05	2026-01-17 02:57:32.469543-05
f1d93cc5-6973-4c2c-93d8-fa7190fdb6d0	7621162350	CHECKED_OUT	2026-01-14 00:32:55.384197-05	2026-01-15 22:23:42.237782-05
9bdcb08e-fa25-412c-8d20-dea4206a2a14	7621162350	CHECKED_OUT	2026-01-13 05:17:21.553887-05	2026-01-13 05:19:43.982402-05
5fde7ad3-108f-4cb0-a738-2b07ee6bf6e2	7949394998	CHECKED_OUT	2026-01-11 05:14:33.909975-05	2026-01-13 06:35:53.552286-05
d05ff6c1-7850-467b-a331-312ea69254b6	7949394998	CHECKED_OUT	2026-01-13 06:35:53.552286-05	2026-01-13 06:38:22.791878-05
7b3725d9-4daf-417d-aee9-18dcd2d9cf42	7621162350	CHECKED_OUT	2026-01-13 21:40:21.670647-05	2026-01-13 22:03:23.514557-05
1b5d03c2-fb95-4505-92e9-3d5750f1f68d	7949394998	CHECKED_OUT	2026-01-14 23:49:45.633763-05	2026-01-16 10:26:47.386424-05
a542ec2c-33b6-4852-9d55-383df0a0d8b1	7621162350	CHECKED_OUT	2026-01-17 05:28:01.689788-05	2026-01-17 13:34:34.543045-05
f837f002-f533-43dd-b77c-f82655236567	7621162350	ACTIVE	2026-01-17 13:34:34.543045-05	2026-01-17 13:34:34.543045-05
e98ec545-8577-40df-baa2-ba5ae32e2deb	7621162350	CHECKED_OUT	2026-01-15 22:23:42.237782-05	2026-01-17 05:28:01.689788-05
a7116ff9-d043-4e42-9ace-8c55b04ad20a	8547565029	CHECKED_OUT	2026-01-17 05:38:43.188518-05	2026-01-17 14:02:06.324179-05
\.


--
-- Data for Name: commissions; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.commissions (id, order_id, affiliate_id, rate, amount, status, earned_at, paid_out_at, refunded_amount, refunded_at, refund_reason, reserved_amount, paid_out_amount) FROM stdin;
17a85859-0dfc-424d-8d5f-f6ab982fe98b	6358641d-4366-4a80-8e95-a83d33345b22	0252c270-fe08-467b-810a-3a3d3841d112	0.0500	2.25	REFUNDED	2026-01-22 16:49:42.983449-05	2026-01-22 17:15:01.646248-05	2.25	2026-01-22 17:42:23.028818-05	\N	0.00	2.25
094336d5-02f1-4ab0-90da-65bad6159c06	7240aff5-8793-4a4c-9853-be8d74646ff0	0252c270-fe08-467b-810a-3a3d3841d112	0.2000	200.00	REFUNDED	2026-01-22 04:39:31.52521-05	2026-01-22 06:04:45.596546-05	200.00	2026-01-22 18:44:30.033203-05	\N	0.00	200.00
5c073cb9-1ce4-4ebc-af41-d4924bcee6d3	858cc7a0-5d40-495d-b86a-3c1be85ef3a7	0252c270-fe08-467b-810a-3a3d3841d112	0.2000	4.00	PAID_OUT	2026-01-22 20:06:17.980021-05	2026-01-23 22:51:48.788383-05	0.00	\N	\N	0.00	4.00
e17773b1-cbd3-4dd5-bcd3-79e0b12d44d4	f3b0ca11-9add-4a99-b52a-60a344ebb8d4	0252c270-fe08-467b-810a-3a3d3841d112	0.0500	0.75	PAID_OUT	2026-01-22 20:07:53.614324-05	2026-01-23 22:51:48.788383-05	0.00	\N	\N	0.00	0.75
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.order_items (id, order_id, product_id, qty, price_usd, created_at, unit_price_usd, total_price_usd, line_total_usd) FROM stdin;
5b9f970e-ace0-47df-a622-83ad3a02e1d6	7240aff5-8793-4a4c-9853-be8d74646ff0	11c06a10-7251-4e0b-8cd9-4ab82d775daa	1	1000.00	2026-01-22 04:36:47.987538-05	1000.00	1000.00	1000.00
b2ab1c80-275e-41d6-a8c7-87b41d6b8825	7210eec0-9014-4d1f-86b6-acf589484c72	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	1	25.00	2026-01-22 04:43:49.161639-05	25.00	25.00	25.00
cd779ae5-555e-4aa7-b034-0798cf3669ae	a87951e8-f883-4e57-928c-4e4bc42c86ce	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	1	25.00	2026-01-22 04:48:07.63713-05	25.00	25.00	25.00
8808e0e8-d77c-484b-9579-241f72c3d360	6358641d-4366-4a80-8e95-a83d33345b22	2acf5ea0-704f-4ca6-9619-a242a2fe2122	1	15.00	2026-01-22 07:25:20.029-05	15.00	15.00	15.00
6a8e92ad-ebcf-440b-b9f1-5df2aa858f81	6358641d-4366-4a80-8e95-a83d33345b22	cc9b1681-086f-4eff-88d1-7bfea1a433e2	1	15.00	2026-01-22 07:25:20.029-05	15.00	15.00	15.00
f570e1ad-1d87-47ea-9a92-5fd63ff1781b	6358641d-4366-4a80-8e95-a83d33345b22	d3a83b4d-7b2d-404b-bb5f-c1a8a20bd2dd	1	15.00	2026-01-22 07:25:20.029-05	15.00	15.00	15.00
e24c7ade-8b05-438a-902f-d8d2637d1b1f	858cc7a0-5d40-495d-b86a-3c1be85ef3a7	71af3a91-a689-49f4-bb6b-b4afa279bcf4	1	20.00	2026-01-22 19:17:56.950904-05	20.00	20.00	20.00
d278de61-0375-4c32-9f3c-ef37fd225823	f3b0ca11-9add-4a99-b52a-60a344ebb8d4	79f4085b-c38a-40de-a4a2-951d1caa0142	1	15.00	2026-01-22 19:38:20.207576-05	15.00	15.00	15.00
488c1a5e-062f-4cec-b4c8-14058c0d0032	265255f4-2441-4083-9946-a7cbc9e30a6a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	1	25.00	2026-01-22 20:53:33.482283-05	25.00	25.00	25.00
b02c9deb-d1ae-435e-9501-67b3043585cc	2060acf8-c2a8-492d-98de-cfbcbe92c28b	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	1	25.00	2026-01-22 21:19:43.088532-05	25.00	25.00	25.00
9e7149ff-8179-459c-a196-b08132e3a84c	9d6059cc-a24e-4d64-9a53-b0753b72f145	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	1	25.00	2026-01-23 21:05:16.860384-05	25.00	25.00	25.00
b28c3956-3bb0-49eb-a2d1-f22c5d6c1196	c135711c-8309-4186-8bce-80c6220f4a33	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	1	25.00	2026-01-23 21:13:24.985923-05	25.00	25.00	25.00
\.


--
-- Data for Name: order_payments; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.order_payments (id, order_id, screenshot_file_id, submitted_at, review_status, reviewed_by_admin_at, payment_method) FROM stdin;
045c8df8-3e4c-486f-bcd3-5110bf8d3fb1	7240aff5-8793-4a4c-9853-be8d74646ff0	AgACAgEAAxkBAAPXaXHwB_ew_PL2Ew-W7t26c5pWIfIAArYLaxsYKZFH4x32gO2WQF4BAAMCAAN5AAM4BA	2026-01-22 04:38:15.470227-05	APPROVED	2026-01-22 04:39:31.52521-05	nequi
f7a4fecb-fb4e-4c6a-a098-30c1ac6c596a	858cc7a0-5d40-495d-b86a-3c1be85ef3a7	AgACAgEAAxkBAAIBE2lyvqXJ7umKA6WhE0qqIaBMeG5WAAJ2C2sbGCmZRw5h9yvgK8hsAQADAgADeQADOAQ	2026-01-22 19:19:52.256327-05	APPROVED	2026-01-22 20:06:17.980021-05	nequi
9fe66875-bc1b-4d9e-a133-b24d4ac16150	6358641d-4366-4a80-8e95-a83d33345b22	AgACAgEAAxkBAAPxaXIXd9v7uMp4P-qxR2VoOZuvPgQAAp0Laxu-XphHDlWrJd2lNzkBAAMCAANtAAM4BA	2026-01-22 07:26:33.003732-05	APPROVED	2026-01-22 16:49:42.983449-05	mp
329c7542-8745-42f0-bfea-7127570b3731	f3b0ca11-9add-4a99-b52a-60a344ebb8d4	AgACAgEAAxkBAAIBG2lywxPTLdU4k9CNXW2SNRY4vbj_AAJ6C2sbGCmZR_HKngyCueeUAQADAgADeQADOAQ	2026-01-22 19:38:44.181788-05	APPROVED	2026-01-22 20:07:53.614324-05	mp
\.


--
-- Data for Name: order_refunds; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.order_refunds (id, order_id, amount, refund_type, reason, refunded_by_admin, created_at) FROM stdin;
a1dd429e-21a4-479d-8dbe-7ef9e2b422b9	2fdf1dce-ad23-4636-bd99-157e6fe26c31	50.00	FULL	metodo invalido	admin	2026-01-20 16:32:05.356722-05
40735d88-eb0d-49f2-be2c-6b1f6a42e21c	b3181d55-5568-45b1-813c-6f82eece73ea	50.00	FULL	\N	admin	2026-01-20 16:33:59.239691-05
eb7d64e9-2728-403f-ab86-9c72923960d3	c54f7f4c-afe1-4e3c-9186-b40f84092948	90.00	FULL	no sirvio el metodo	admin	2026-01-21 17:52:17.925675-05
30e48a4c-d636-4bfb-98ea-b4c57b3def80	eaf4147b-df75-4526-84d3-bfacd62cd2d5	10.00	FULL	\N	admin	2026-01-22 03:41:15.935333-05
8e33a0f4-db3c-43bd-9198-a371c35aaa48	6358641d-4366-4a80-8e95-a83d33345b22	45.00	FULL	\N	admin	2026-01-22 17:42:23.028818-05
8bd6bed2-1159-42cb-8a1e-b9d290b95c7d	7240aff5-8793-4a4c-9853-be8d74646ff0	1000.00	FULL	\N	admin	2026-01-22 18:44:30.033203-05
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.orders (id, user_id, product_id, affiliate_id, status, unit_price_at_purchase, created_at, paid_at, delivered_at, order_number, refunded_at, refunded_amount, refund_reason, cancelled_at, cancel_source) FROM stdin;
f3b0ca11-9add-4a99-b52a-60a344ebb8d4	8f8cbac9-75c9-4151-80a8-880fc3317aac	79f4085b-c38a-40de-a4a2-951d1caa0142	0252c270-fe08-467b-810a-3a3d3841d112	DELIVERED	15.00	2026-01-22 19:38:20.207576-05	2026-01-22 20:07:53.614324-05	2026-01-22 20:08:21.053869-05	4	\N	0.00	\N	\N	\N
265255f4-2441-4083-9946-a7cbc9e30a6a	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	25.00	2026-01-22 20:53:33.482283-05	\N	\N	\N	\N	0.00	\N	2026-01-22 21:03:51.874224-05	EXPIRED
9d6059cc-a24e-4d64-9a53-b0753b72f145	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	25.00	2026-01-23 21:05:16.860384-05	\N	\N	\N	\N	0.00	\N	2026-01-23 21:15:42.056757-05	EXPIRED
6358641d-4366-4a80-8e95-a83d33345b22	cd8e170f-f4e1-4a06-926f-d6de78b8894a	2acf5ea0-704f-4ca6-9619-a242a2fe2122	0252c270-fe08-467b-810a-3a3d3841d112	REFUNDED	45.00	2026-01-22 07:25:20.029-05	2026-01-22 16:49:42.983449-05	2026-01-22 16:50:10.385134-05	2	2026-01-22 17:42:23.028818-05	45.00	\N	\N	\N
7240aff5-8793-4a4c-9853-be8d74646ff0	8f8cbac9-75c9-4151-80a8-880fc3317aac	11c06a10-7251-4e0b-8cd9-4ab82d775daa	0252c270-fe08-467b-810a-3a3d3841d112	REFUNDED	1000.00	2026-01-22 04:36:47.987538-05	2026-01-22 04:39:31.52521-05	2026-01-22 04:40:03.702317-05	1	2026-01-22 18:44:30.033203-05	1000.00	\N	\N	\N
5a8e8f40-fb0f-4ca7-b456-0ab52dceac77	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	\N	EXPIRED	0.00	2026-01-14 00:32:55.384197-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
70805f36-dfd2-489c-b7e9-5ecbacfb7ce5	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	378be0ae-f326-41cb-930f-8e2bae27ff69	\N	EXPIRED	18.00	2026-01-14 22:42:29.14836-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
a7c44512-ed30-4800-9d7c-6298e76caa8c	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	\N	EXPIRED	50.00	2026-01-19 16:58:45.291552-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
5eaebfbd-cc19-426d-97aa-aca1d9a5f8fb	cd8e170f-f4e1-4a06-926f-d6de78b8894a	fb9d200f-5b61-42b0-924c-b6338b69b478	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	152.00	2026-01-14 23:22:35.206539-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
6d08583c-08e0-4eed-ba85-1aa65a153b4d	8f8cbac9-75c9-4151-80a8-880fc3317aac	fb9d200f-5b61-42b0-924c-b6338b69b478	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	90.00	2026-01-17 05:38:43.188518-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
e4363019-022a-409c-afd7-0aea2b6fbf5b	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	2656c42a-d164-45a7-a240-ab18ef947b1e	\N	EXPIRED	120.00	2026-01-17 05:28:01.689788-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
ebe4e1e3-5a94-4a21-962d-92fd58ac5588	8f8cbac9-75c9-4151-80a8-880fc3317aac	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	0252c270-fe08-467b-810a-3a3d3841d112	CANCELLED	50.00	2026-01-19 18:26:32.247777-05	\N	\N	\N	\N	0.00	\N	\N	\N
09645fbd-e39f-4e26-9e0e-c0ed3b9b65b0	2f4c0dbe-190c-4f36-bf25-53605841d495	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	\N	CANCELLED	50.00	2026-01-19 19:12:33.301857-05	\N	\N	\N	\N	0.00	\N	\N	\N
a819c0be-1988-4a11-88c5-4a61a3ec144d	cd8e170f-f4e1-4a06-926f-d6de78b8894a	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	0252c270-fe08-467b-810a-3a3d3841d112	CANCELLED	50.00	2026-01-20 16:37:37.209733-05	\N	\N	\N	\N	0.00	\N	\N	\N
c54f7f4c-afe1-4e3c-9186-b40f84092948	cd8e170f-f4e1-4a06-926f-d6de78b8894a	1c81b811-ba5f-474e-ae84-03535202dd71	0252c270-fe08-467b-810a-3a3d3841d112	CANCELLED	90.00	2026-01-21 12:37:33.565924-05	\N	\N	\N	2026-01-21 17:52:17.925675-05	90.00	no sirvio el metodo	\N	\N
8e51564c-08df-4604-a234-8f6d31941fda	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	CANCELLED	24.00	2026-01-15 22:22:01.500123-05	\N	\N	\N	\N	0.00	\N	\N	\N
508a36bc-9214-4e28-84c7-e2713f3bb7e4	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	CANCELLED	30.00	2026-01-14 03:52:18.527016-05	\N	\N	\N	\N	0.00	\N	\N	\N
7c46c729-a091-4460-bbb3-2280a3fde2f0	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	CANCELLED	24.00	2026-01-14 16:40:23.862241-05	\N	\N	\N	\N	0.00	\N	\N	\N
b3181d55-5568-45b1-813c-6f82eece73ea	cd8e170f-f4e1-4a06-926f-d6de78b8894a	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	0252c270-fe08-467b-810a-3a3d3841d112	CANCELLED	50.00	2026-01-19 17:13:36.517981-05	\N	\N	\N	2026-01-20 16:33:59.239691-05	50.00	\N	\N	\N
eaf4147b-df75-4526-84d3-bfacd62cd2d5	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	11c06a10-7251-4e0b-8cd9-4ab82d775daa	\N	CANCELLED	10.00	2026-01-20 19:47:25.713789-05	\N	\N	\N	2026-01-22 03:41:15.935333-05	10.00	\N	\N	\N
93d70572-a8be-4297-98e8-36a611736a8c	cd8e170f-f4e1-4a06-926f-d6de78b8894a	a627ee3f-ffb8-4ee7-8540-430027d5a90e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	50.00	2026-01-16 10:30:58.615834-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
3145897c-a86d-4d8b-bef4-479fd4ba5cc3	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-16 00:01:54.451135-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
22274fa6-0263-4c56-ad90-2fd8e4412bbb	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 23:44:56.013322-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
80b3ad1c-327d-450c-a24c-4a03432e628f	8f8cbac9-75c9-4151-80a8-880fc3317aac	2656c42a-d164-45a7-a240-ab18ef947b1e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	120.00	2026-01-17 05:34:09.44487-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
858cc7a0-5d40-495d-b86a-3c1be85ef3a7	8f8cbac9-75c9-4151-80a8-880fc3317aac	71af3a91-a689-49f4-bb6b-b4afa279bcf4	0252c270-fe08-467b-810a-3a3d3841d112	DELIVERED	20.00	2026-01-22 19:17:56.950904-05	2026-01-22 20:06:17.980021-05	2026-01-22 20:06:46.690093-05	3	\N	0.00	\N	\N	\N
2060acf8-c2a8-492d-98de-cfbcbe92c28b	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	25.00	2026-01-22 21:19:43.088532-05	\N	\N	\N	\N	0.00	\N	2026-01-22 21:30:30.851885-05	EXPIRED
c135711c-8309-4186-8bce-80c6220f4a33	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	25.00	2026-01-23 21:13:24.985923-05	\N	\N	\N	\N	0.00	\N	2026-01-23 21:23:41.85772-05	EXPIRED
4e7a98cf-3bd4-471f-aabb-a07048346c78	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	f183f1ae-bd5f-45a7-a229-d2fce3727939	\N	EXPIRED	0.00	2026-01-13 23:42:29.482534-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
7210eec0-9014-4d1f-86b6-acf589484c72	8f8cbac9-75c9-4151-80a8-880fc3317aac	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	25.00	2026-01-22 04:43:49.161639-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
b4cc9017-98f6-48e0-be72-a274d4b704ea	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	f183f1ae-bd5f-45a7-a229-d2fce3727939	\N	EXPIRED	0.00	2026-01-14 00:03:52.602131-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
dcdc5066-9f1e-47c2-8917-d932e1f5175f	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 23:52:35.183141-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
a9189b64-c557-4294-beff-5ef102167a3e	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	2917d506-292d-41e0-9dce-14f4f251bbc5	\N	EXPIRED	22.00	2026-01-15 21:47:44.428471-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
fc40c6ed-58d1-4076-a785-90f36c7dc9c5	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	\N	EXPIRED	0.00	2026-01-13 23:53:35.612443-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
7adaceea-b50a-42dd-a39f-66d32c8dd1fa	8f8cbac9-75c9-4151-80a8-880fc3317aac	2656c42a-d164-45a7-a240-ab18ef947b1e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-19 01:08:14.257544-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
682ddcc5-d84f-45c1-a8bf-c791a44786ec	8f8cbac9-75c9-4151-80a8-880fc3317aac	2656c42a-d164-45a7-a240-ab18ef947b1e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-19 01:54:08.531058-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
83d97c2c-c3d0-4c1d-942b-b78df4f03085	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	EXPIRED	30.00	2026-01-14 04:34:58.908412-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
db19faa7-41aa-4e27-ad4c-df0ee63e6b6d	cd8e170f-f4e1-4a06-926f-d6de78b8894a	a627ee3f-ffb8-4ee7-8540-430027d5a90e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	10.00	2026-01-14 23:49:09.050129-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
7772edad-b1bb-4926-962f-39795598e642	8f8cbac9-75c9-4151-80a8-880fc3317aac	2656c42a-d164-45a7-a240-ab18ef947b1e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-19 00:27:01.900344-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
33dd36f4-867d-418e-b596-b0b5bd58068f	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	d6885302-6754-4aa5-8f1d-f676b313efc1	\N	EXPIRED	15.00	2026-01-14 03:38:48.982433-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
a1d329bf-591d-4684-8f8b-0e2799aaabc7	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-16 05:44:35.923192-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
9014e352-e92e-4fb1-9f34-1d536fd24406	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-16 06:23:08.548899-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
ad91636f-68d7-4b60-95f9-343d502f1929	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 23:16:28.218678-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
9622298a-bad1-461a-8cee-29a07d6ef9d3	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	d6885302-6754-4aa5-8f1d-f676b313efc1	\N	EXPIRED	15.00	2026-01-14 03:39:52.500425-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
a87951e8-f883-4e57-928c-4e4bc42c86ce	8f8cbac9-75c9-4151-80a8-880fc3317aac	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	25.00	2026-01-22 04:48:07.63713-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
6ad04204-d54e-4c2a-9f41-c9e040fe9708	cd8e170f-f4e1-4a06-926f-d6de78b8894a	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	50.00	2026-01-20 23:00:29.364411-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
5a5f2168-d6c4-41f1-927a-7fe85a1d73f4	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	2656c42a-d164-45a7-a240-ab18ef947b1e	\N	EXPIRED	72.00	2026-01-15 22:23:42.237782-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
dd2d397c-b34f-43ad-a068-afd1ca619832	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	600.00	2026-01-17 13:34:34.543045-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
b8726a2c-a7fa-43bb-8149-ca8fbebba8f5	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	EXPIRED	30.00	2026-01-14 04:44:21.444782-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
e044d4f7-4e4f-44f2-b743-5965f63e45f9	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-14 23:00:48.055042-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
9fca83d2-fe4a-4f23-bcad-4a8d7d12856c	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	\N	EXPIRED	30.00	2026-01-14 05:23:56.38701-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
5579e49a-5436-4bf8-8a96-35ae51366cbc	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	EXPIRED	30.00	2026-01-14 04:32:23.531642-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
c3949df4-4795-4225-97de-52f06f4b6b0c	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	25.00	2026-01-22 03:55:55.176655-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
86951483-a3a4-4c20-8129-3a98056098e8	cd8e170f-f4e1-4a06-926f-d6de78b8894a	a627ee3f-ffb8-4ee7-8540-430027d5a90e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	104.00	2026-01-14 23:49:45.633763-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
a97a9b6a-c33d-4360-a643-468c04160c40	8f8cbac9-75c9-4151-80a8-880fc3317aac	d6885302-6754-4aa5-8f1d-f676b313efc1	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	225.00	2026-01-17 02:57:32.469543-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
cd08e522-4dd3-4b9e-8baa-879539202df5	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	EXPIRED	30.00	2026-01-14 03:58:39.619423-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
38e58b90-d240-4ad9-99ba-49f56ce98410	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-16 06:02:46.70649-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
5b9a7813-1385-4fcc-8fc4-f8894990aeff	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	d6885302-6754-4aa5-8f1d-f676b313efc1	\N	EXPIRED	15.00	2026-01-14 03:31:30.897628-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
e9981e7a-5202-482e-83ee-d2863ede4ecd	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	d6885302-6754-4aa5-8f1d-f676b313efc1	\N	EXPIRED	15.00	2026-01-14 03:46:58.203583-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
2097a72b-c421-4f42-bb82-74c750029471	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-14 03:51:27.014698-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
715880a8-1002-41fe-9e63-7c410c9f143a	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	EXPIRED	30.00	2026-01-14 04:36:48.134597-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
c7004a37-4b86-4286-b509-9b45f0861f77	cd8e170f-f4e1-4a06-926f-d6de78b8894a	a627ee3f-ffb8-4ee7-8540-430027d5a90e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	10.00	2026-01-16 10:30:40.465189-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
1e9ba96f-a0c6-444f-bec6-0821aec4f330	8f8cbac9-75c9-4151-80a8-880fc3317aac	2656c42a-d164-45a7-a240-ab18ef947b1e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	120.00	2026-01-17 05:31:39.907927-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
bf2a1cdf-9255-4f68-82e1-a63a531407a4	8f8cbac9-75c9-4151-80a8-880fc3317aac	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	600.00	2026-01-17 14:02:06.324179-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
1598c865-b867-4fb2-bd80-5042a7346f31	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-15 04:06:28.535674-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
1d6b62b6-f031-4b5c-99a5-1c95a4a7028a	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	10.00	2026-01-16 10:26:47.386424-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
b56ddcbf-232c-4ed3-9729-ae0cba292cda	8f8cbac9-75c9-4151-80a8-880fc3317aac	2656c42a-d164-45a7-a240-ab18ef947b1e	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-19 00:14:37.282607-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
7f4e6f9b-ed3d-4d82-9fd1-7c4c5a05b289	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-14 00:02:54.542954-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
001a6673-e8a5-4e39-8982-446d0c2cc818	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-16 05:36:05.235291-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
b72b832d-90b7-496c-9ada-4568a89a8a13	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 21:46:02.871261-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
9e68d923-89c0-484f-b38c-1e1313944c9d	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 21:43:40.756384-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
d40f1101-e7a2-439d-87da-5e02c64c22b8	8f8cbac9-75c9-4151-80a8-880fc3317aac	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	200.00	2026-01-17 03:54:03.407101-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
0f96671d-0590-4ece-a729-c9b1cca138c6	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	378be0ae-f326-41cb-930f-8e2bae27ff69	\N	EXPIRED	18.00	2026-01-14 03:14:54.86239-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
b9f237e5-83d1-4b22-bf3a-0580fe735a1a	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	fb9d200f-5b61-42b0-924c-b6338b69b478	\N	EXPIRED	30.00	2026-01-14 04:11:54.695277-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
fcc4be28-4650-4f6b-b3d9-7ba47c42a7fd	cd8e170f-f4e1-4a06-926f-d6de78b8894a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	0252c270-fe08-467b-810a-3a3d3841d112	EXPIRED	24.00	2026-01-15 04:18:11.297069-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
320e2ef5-a5f0-45e0-9310-b6f8a39d7d2d	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-14 21:48:07.230237-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
7ca21f5e-852e-4d30-b485-a5237b5e8927	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-14 03:50:33.187784-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
5ba93a7f-7818-415d-8c2e-54532175db43	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	d6885302-6754-4aa5-8f1d-f676b313efc1	\N	EXPIRED	75.00	2026-01-13 22:03:23.514557-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
bcf97d0b-94ad-4de6-9c17-fc99b0f947fc	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 23:27:31.158811-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
8980221b-9b26-41d3-9788-fb5dbd5acd24	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	\N	EXPIRED	24.00	2026-01-15 22:17:07.499146-05	\N	\N	\N	\N	0.00	\N	2026-01-22 19:25:13.11435-05	EXPIRED
2fdf1dce-ad23-4636-bd99-157e6fe26c31	8f8cbac9-75c9-4151-80a8-880fc3317aac	4ef04bc1-c3a0-47a1-81c6-f87b79128496	0252c270-fe08-467b-810a-3a3d3841d112	CANCELLED	50.00	2026-01-19 18:53:42.197489-05	\N	\N	\N	2026-01-20 16:32:05.356722-05	50.00	metodo invalido	\N	\N
\.


--
-- Data for Name: payout_adjustments; Type: TABLE DATA; Schema: public; Owner: muza
--

COPY public.payout_adjustments (payout_id, adjustment_id, amount, created_at) FROM stdin;
cbeda67d-fe48-4079-845d-ed29e4bb970a	d53e8f2f-df4a-4944-9c8e-068df45a2ace	17.75	2026-01-22 16:55:47.640192-05
3d446936-3c87-451b-b67b-9e9e8238938d	d53e8f2f-df4a-4944-9c8e-068df45a2ace	33.75	2026-01-22 17:45:15.778754-05
5ea17e7a-047c-4bf9-bdc4-6abca261c966	d53e8f2f-df4a-4944-9c8e-068df45a2ace	25.00	2026-01-22 18:16:22.131238-05
c4212c58-5b72-445c-b89b-f42a375822a6	d53e8f2f-df4a-4944-9c8e-068df45a2ace	25.00	2026-01-22 18:23:47.36823-05
365417f7-9e5f-4693-b008-804c6a71cf04	d53e8f2f-df4a-4944-9c8e-068df45a2ace	24.00	2026-01-23 22:49:41.515729-05
3e0d701f-343e-4fa5-b1a3-ca3add64d3ce	d53e8f2f-df4a-4944-9c8e-068df45a2ace	20.00	2026-01-23 23:20:01.179655-05
\.


--
-- Data for Name: payout_items; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.payout_items (id, payout_id, commission_id, amount, created_at) FROM stdin;
28380abc-be8e-4baa-ae4f-e3c5157064d4	d976d63c-4888-4400-9c4a-974ae92e8391	094336d5-02f1-4ab0-90da-65bad6159c06	200.00	2026-01-22 05:55:09.518655-05
caecba9f-674c-4519-8e4b-2c774c958ba9	cbeda67d-fe48-4079-845d-ed29e4bb970a	17a85859-0dfc-424d-8d5f-f6ab982fe98b	2.25	2026-01-22 16:55:47.640192-05
6aa93805-c49f-45aa-b758-9f0a775986a4	365417f7-9e5f-4693-b008-804c6a71cf04	5c073cb9-1ce4-4ebc-af41-d4924bcee6d3	4.00	2026-01-23 22:49:41.515729-05
1a73d68d-ed1a-4e94-96f0-66f8d982035c	365417f7-9e5f-4693-b008-804c6a71cf04	e17773b1-cbd3-4dd5-bcd3-79e0b12d44d4	0.75	2026-01-23 22:49:41.515729-05
\.


--
-- Data for Name: payouts; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.payouts (id, affiliate_id, amount, method, destination, status, created_at, sent_at, debt_applied, receipt_path, receipt_filename, receipt_mime) FROM stdin;
365417f7-9e5f-4693-b008-804c6a71cf04	0252c270-fe08-467b-810a-3a3d3841d112	28.75	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-23 22:49:41.515729-05	2026-01-23 22:51:48.788383-05	0.00	\N	\N	\N
3e0d701f-343e-4fa5-b1a3-ca3add64d3ce	0252c270-fe08-467b-810a-3a3d3841d112	20.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-23 23:20:01.179655-05	2026-01-23 23:20:35.692629-05	0.00	/Users/muza/Downloads/Prueba Bot Telegram/telegram-sales-api/uploads/payout-receipts/payout-3e0d701f-343e-4fa5-b1a3-ca3add64d3ce.png	payout-3e0d701f-343e-4fa5-b1a3-ca3add64d3ce.png	image/png
ad0dd4c3-c8dd-43ef-863f-1914107fc029	0252c270-fe08-467b-810a-3a3d3841d112	180.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	CANCELLED	2026-01-22 05:26:42.755858-05	\N	0.00	\N	\N	\N
16e12d80-ba91-437b-8638-4dfc42136995	0252c270-fe08-467b-810a-3a3d3841d112	180.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	CANCELLED	2026-01-22 05:28:15.988782-05	\N	0.00	\N	\N	\N
d976d63c-4888-4400-9c4a-974ae92e8391	0252c270-fe08-467b-810a-3a3d3841d112	179.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-22 05:55:09.518655-05	2026-01-22 06:04:45.596546-05	0.00	\N	\N	\N
cbeda67d-fe48-4079-845d-ed29e4bb970a	0252c270-fe08-467b-810a-3a3d3841d112	20.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-22 16:55:47.640192-05	2026-01-22 17:15:01.646248-05	0.00	\N	\N	\N
3d446936-3c87-451b-b67b-9e9e8238938d	0252c270-fe08-467b-810a-3a3d3841d112	33.75	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-22 17:45:15.778754-05	2026-01-22 17:45:31.687871-05	0.00	\N	\N	\N
5ea17e7a-047c-4bf9-bdc4-6abca261c966	0252c270-fe08-467b-810a-3a3d3841d112	25.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-22 18:16:22.131238-05	2026-01-22 18:17:21.287176-05	0.00	\N	\N	\N
c4212c58-5b72-445c-b89b-f42a375822a6	0252c270-fe08-467b-810a-3a3d3841d112	25.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	SENT	2026-01-22 18:23:47.36823-05	2026-01-22 18:24:11.505331-05	0.00	\N	\N	\N
94b05b7d-bc72-4b87-9823-05d95d5258df	0252c270-fe08-467b-810a-3a3d3841d112	50.00	USDT_BSC	0xa24dcff8ee877f3479468039affb0371a93dc842	CANCELLED	2026-01-22 18:25:01.413963-05	\N	0.00	\N	\N	\N
\.


--
-- Data for Name: product_stock_holds; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.product_stock_holds (id, product_id, order_id, cart_id, telegram_id, qty, status, expires_at, created_at, updated_at) FROM stdin;
a72754c3-1557-4199-b7f7-ca1d87b82e1d	d6885302-6754-4aa5-8f1d-f676b313efc1	5ba93a7f-7818-415d-8c2e-54532175db43	7b3725d9-4daf-417d-aee9-18dcd2d9cf42	7621162350	5	CONSUMED	2026-01-13 22:13:23.514557-05	2026-01-13 22:03:23.514557-05	2026-01-13 22:04:17.610901-05
803d282e-4723-40df-9117-6e886a655fbe	f183f1ae-bd5f-45a7-a229-d2fce3727939	4e7a98cf-3bd4-471f-aabb-a07048346c78	\N	7621162350	1	EXPIRED	2026-01-13 23:52:29.482534-05	2026-01-13 23:42:29.482534-05	2026-01-13 23:52:58.956503-05
8e89af04-647f-42fe-9e34-ab15eb0aaebe	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	fc40c6ed-58d1-4076-a785-90f36c7dc9c5	\N	7621162350	1	EXPIRED	2026-01-14 00:03:35.612443-05	2026-01-13 23:53:35.612443-05	2026-01-14 00:04:18.560656-05
234731c4-5ff5-4141-8913-1b4e8bdf2f43	f183f1ae-bd5f-45a7-a229-d2fce3727939	b4cc9017-98f6-48e0-be72-a274d4b704ea	\N	7621162350	1	CONSUMED	2026-01-14 00:13:52.602131-05	2026-01-14 00:03:52.602131-05	2026-01-14 00:05:31.002672-05
e24ae0f7-518d-46a3-b333-457ad6755594	2e75fbd8-5602-4499-a8b8-17825f6ed371	5a8e8f40-fb0f-4ca7-b456-0ab52dceac77	78477d92-0463-4005-adcb-2d5be34db788	7621162350	3	CONSUMED	2026-01-14 00:42:55.384197-05	2026-01-14 00:32:55.384197-05	2026-01-14 00:34:33.828181-05
95984a49-6a37-49f3-9ff0-3f94ae34099a	b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	5a8e8f40-fb0f-4ca7-b456-0ab52dceac77	78477d92-0463-4005-adcb-2d5be34db788	7621162350	2	CONSUMED	2026-01-14 00:42:55.384197-05	2026-01-14 00:32:55.384197-05	2026-01-14 00:34:33.828181-05
17f2a851-10f0-4f2e-b6e6-c70f4e5288b8	d6885302-6754-4aa5-8f1d-f676b313efc1	5b9a7813-1385-4fcc-8fc4-f8894990aeff	\N	7621162350	1	CONSUMED	2026-01-14 03:41:30.897628-05	2026-01-14 03:31:30.897628-05	2026-01-14 03:34:11.172432-05
23c6b697-c6dd-4b9a-b129-8a51120c7007	d6885302-6754-4aa5-8f1d-f676b313efc1	9622298a-bad1-461a-8cee-29a07d6ef9d3	\N	7621162350	1	CONSUMED	2027-01-14 03:41:05.388357-05	2026-01-14 03:39:52.500425-05	2026-01-14 03:46:07.179273-05
2100c565-5b07-47aa-a2e3-3f839555961f	d6885302-6754-4aa5-8f1d-f676b313efc1	33dd36f4-867d-418e-b596-b0b5bd58068f	\N	7621162350	1	EXPIRED	2026-01-14 03:48:48.982433-05	2026-01-14 03:38:48.982433-05	2026-01-14 03:49:25.087156-05
2a666938-81ab-435f-8951-b5518c444b47	d6885302-6754-4aa5-8f1d-f676b313efc1	e9981e7a-5202-482e-83ee-d2863ede4ecd	\N	7621162350	1	EXPIRED	2026-01-14 03:56:58.203583-05	2026-01-14 03:46:58.203583-05	2026-01-14 03:57:25.124287-05
cd345056-04c5-4963-a180-9227305df145	d6885302-6754-4aa5-8f1d-f676b313efc1	a97a9b6a-c33d-4360-a643-468c04160c40	64b96179-d86e-44ad-9944-574fa9daff0b	8547565029	15	CONSUMED	2027-01-17 02:58:11.62764-05	2026-01-17 02:57:32.469543-05	2026-01-17 02:58:39.253184-05
ba5a7621-0d2e-4b2f-98e5-ed4a348628ff	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	a7c44512-ed30-4800-9d7c-6298e76caa8c	\N	7621162350	1	EXPIRED	2026-01-19 17:08:45.291552-05	2026-01-19 16:58:45.291552-05	2026-01-19 17:09:16.402198-05
257fb628-c105-45e4-8ba8-719804be89d7	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	b3181d55-5568-45b1-813c-6f82eece73ea	\N	7949394998	1	CONSUMED	2027-01-19 17:14:11.496283-05	2026-01-19 17:13:36.517981-05	2026-01-19 17:16:08.990894-05
86257d7d-e9ad-42f3-be5b-f30d0c30a882	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	a819c0be-1988-4a11-88c5-4a61a3ec144d	e1dcd060-ceea-4f5f-9ad3-2d53737e9052	7949394998	1	EXPIRED	2026-01-20 18:42:01.270229-05	2026-01-20 16:37:37.209733-05	2026-01-20 18:42:01.270229-05
c87e0fd6-c2a0-48c7-8494-cee774f6456e	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	ebe4e1e3-5a94-4a21-962d-92fd58ac5588	41a85211-b003-47ef-9bcd-84579ea84281	8547565029	1	EXPIRED	2026-01-20 18:42:05.64375-05	2026-01-19 18:26:32.247777-05	2026-01-20 18:42:05.64375-05
6d413ec5-3506-42a8-b95d-39167b569a71	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	09645fbd-e39f-4e26-9e0e-c0ed3b9b65b0	\N	8413503771	1	EXPIRED	2026-01-20 18:42:10.327293-05	2026-01-19 19:12:33.301857-05	2026-01-20 18:42:10.327293-05
0c208c77-72fc-48f6-8976-099c5208f7f4	86b71c5c-f34e-4c90-a069-8f9befd5d8ac	6ad04204-d54e-4c2a-9f41-c9e040fe9708	\N	7949394998	1	CONSUMED	2027-01-20 23:01:03.728902-05	2026-01-20 23:00:29.364411-05	2026-01-20 23:02:15.173391-05
5c6cfff8-605c-4ea3-bda2-6c5bae8841b8	1c81b811-ba5f-474e-ae84-03535202dd71	c54f7f4c-afe1-4e3c-9186-b40f84092948	\N	7949394998	1	CONSUMED	2027-01-21 12:38:02.050931-05	2026-01-21 12:37:33.565924-05	2026-01-21 13:09:24.557687-05
\.


--
-- Data for Name: product_stock_units; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.product_stock_units (id, product_id, payload, status, held_by_order_id, held_by_telegram_id, held_by_username, held_at, delivered_at, created_at, updated_at) FROM stdin;
fad1a499-f2f9-42a9-b1f8-14f488223b65	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 2", "title": "Cuenta 2", "password": "p2", "start_at": "2026-01-11", "username": "u2", "expires_at": "2026-02-11"}	DELIVERED	2b6cbfe0-1efc-4349-9c6f-eec4d90c5e45	7949394998	Payments_publicidad	2026-01-11 00:35:37.868547-05	2026-01-11 00:36:15.955212-05	2026-01-11 00:34:02.779922-05	2026-01-11 00:36:15.955212-05
538e9a16-eccd-4f8c-983c-ad6d830a0fcb	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	2b6cbfe0-1efc-4349-9c6f-eec4d90c5e45	7949394998	Payments_publicidad	2026-01-11 00:35:37.868547-05	2026-01-11 00:36:15.955212-05	2026-01-11 00:33:24.210739-05	2026-01-11 00:36:15.955212-05
173b1cbf-cb52-472c-8bc9-32daecb519f5	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "pass002", "start_at": "2026-01-01", "username": "user002", "starts_at": "2026-01-01", "expires_at": "2026-12-31", "external_id": "ext002"}	DELIVERED	6d08583c-08e0-4eed-ba85-1aa65a153b4d	8547565029	publicidad_001	2026-01-17 05:38:43.188518-05	2026-01-17 05:39:32.08415-05	2026-01-11 04:21:49.08015-05	2026-01-17 05:39:32.08415-05
24873b80-cc76-4de0-9087-12bbf13747e4	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	6d08583c-08e0-4eed-ba85-1aa65a153b4d	8547565029	publicidad_001	2026-01-17 05:38:43.188518-05	2026-01-17 05:39:32.08415-05	2026-01-11 16:00:54.890826-05	2026-01-17 05:39:32.08415-05
bdb9551e-f3c7-4b8b-acb8-a37506df0534	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "clave123", "username": "usuario_demo"}	DELIVERED	6d08583c-08e0-4eed-ba85-1aa65a153b4d	8547565029	publicidad_001	2026-01-17 05:38:43.188518-05	2026-01-17 05:39:32.08415-05	2026-01-14 04:34:39.717466-05	2026-01-17 05:39:32.08415-05
f168dda6-bb68-4724-a4d6-8a34b883c0ec	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	08a23901-3be9-48f3-a715-54dfaffd87df	7949394998	Payments_publicidad	2026-01-11 00:55:49.441077-05	2026-01-11 00:56:25.441639-05	2026-01-11 00:53:56.257655-05	2026-01-11 00:56:25.441639-05
b008a2e6-bc0d-4376-9df2-25bb714443d3	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	08a23901-3be9-48f3-a715-54dfaffd87df	7949394998	Payments_publicidad	2026-01-11 00:55:49.441077-05	2026-01-11 00:56:25.441639-05	2026-01-11 00:53:54.537695-05	2026-01-11 00:56:25.441639-05
56da265f-4151-49af-9862-abe87a403afc	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"notes": "Pantalla: Noro\\nPin: 1806\\n\\nGracias por tu compra disfrutala.\\nDisfrutala.", "password": "Noro123.", "username": "noropayments", "duration_unit": "months", "duration_value": "1"}	DELIVERED	eaf4147b-df75-4526-84d3-bfacd62cd2d5	7621162350	NoroPayments	2026-01-20 19:47:25.713789-05	2026-01-20 19:48:44.655399-05	2026-01-20 19:45:06.830424-05	2026-01-20 19:48:44.655399-05
76d61e43-3c80-4bec-ae56-a3b13cf1e411	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"password": "cwew", "username": "fweewcew", "duration_unit": "months", "duration_value": "3"}	AVAILABLE	\N	\N	\N	\N	\N	2026-01-20 19:57:03.361771-05	2026-01-20 19:57:03.361771-05
67732d82-8a8a-4484-bffc-624c1842d485	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"password": "efwfew", "duration_unit": "months", "duration_value": "1"}	AVAILABLE	\N	\N	\N	\N	\N	2026-01-20 19:57:13.990061-05	2026-01-20 19:57:13.990061-05
9161c64f-fe3c-40c2-ad44-763a2eb03a13	11c06a10-7251-4e0b-8cd9-4ab82d775daa	{"notes": "faofp vpe\\nvwevoe\\n\\n\\nwevewvwee", "password": "ewfwefew", "username": "fefewfew", "duration_unit": "months", "duration_value": "2"}	DELIVERED	7240aff5-8793-4a4c-9853-be8d74646ff0	8547565029	publicidad_001	2026-01-22 04:36:47.987538-05	2026-01-22 04:39:31.52521-05	2026-01-20 19:56:53.772392-05	2026-01-22 04:39:31.52521-05
169228e0-5466-40d6-bae2-4ea908ef47ce	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	5b135d4f-46c4-43ac-b238-d38063ae1bd2	7949394998	Payments_publicidad	2026-01-11 01:20:44.426905-05	2026-01-11 01:21:27.03084-05	2026-01-11 01:18:37.400502-05	2026-01-11 01:21:27.03084-05
f8cff271-12ca-462b-9c11-c11ba551bd56	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	5b135d4f-46c4-43ac-b238-d38063ae1bd2	7949394998	Payments_publicidad	2026-01-11 01:20:44.426905-05	2026-01-11 01:21:27.03084-05	2026-01-11 00:53:57.689615-05	2026-01-11 01:21:27.03084-05
93f9c758-8f82-4005-bff4-8f3eb398cece	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	5ea43e7c-ef89-4b1c-ac16-ebbc9de68f2a	7949394998	Payments_publicidad	2026-01-11 01:24:52.961101-05	2026-01-11 01:25:47.047733-05	2026-01-11 01:20:03.651528-05	2026-01-11 01:25:47.047733-05
7bcedff9-9336-4f48-8587-5af906a0ed20	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	5d495f2d-5847-49f0-877c-d0f3e355d3e9	7949394998	Payments_publicidad	2026-01-11 02:09:29.595382-05	2026-01-11 02:10:19.479255-05	2026-01-11 01:20:04.931403-05	2026-01-11 02:10:19.479255-05
f1774bb6-1156-4ded-8cef-e1c2f2970b04	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	5d495f2d-5847-49f0-877c-d0f3e355d3e9	7949394998	Payments_publicidad	2026-01-11 02:09:29.595382-05	2026-01-11 02:10:19.479255-05	2026-01-11 01:20:04.267444-05	2026-01-11 02:10:19.479255-05
ce9f29c5-ab14-4cac-8377-f5b4c6a8c7f1	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "pass002", "start_at": "2026-01-01", "username": "user002", "starts_at": "2026-01-01", "expires_at": "2026-12-31", "external_id": "extn090"}	DELIVERED	532c5c9a-2ebe-47b7-a5a5-6e18ac00412f	7621162350	NoroPayments	2026-01-11 23:06:09.908006-05	2026-01-11 23:06:39.598851-05	2026-01-11 04:47:25.561148-05	2026-01-11 23:06:39.598851-05
4d9fbbac-dfb2-471c-8add-ec3a24dfed0d	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "pass101", "start_at": "2026-01-01", "username": "user101", "starts_at": "2026-01-01", "expires_at": "2026-12-31", "external_id": "vip05_new_101"}	DELIVERED	156b1c71-1681-4985-b687-d6c0f766c90b	7621162350	NoroPayments	2026-01-12 00:00:06.334611-05	2026-01-12 00:00:48.725499-05	2026-01-11 04:59:13.50833-05	2026-01-12 00:00:48.725499-05
19591f32-bf6c-4dbd-99b9-35a5f3344f81	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "pass102", "start_at": "2026-01-01", "username": "user102", "starts_at": "2026-01-01", "expires_at": "2026-12-31", "external_id": "vip05_new_102"}	DELIVERED	156b1c71-1681-4985-b687-d6c0f766c90b	7621162350	NoroPayments	2026-01-12 00:00:06.334611-05	2026-01-12 00:00:48.725499-05	2026-01-11 04:59:13.50833-05	2026-01-12 00:00:48.725499-05
7a69de4c-c9ee-4357-9500-25dfb50f8508	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	156b1c71-1681-4985-b687-d6c0f766c90b	7621162350	NoroPayments	2026-01-12 00:00:06.334611-05	2026-01-12 00:00:48.725499-05	2026-01-11 01:20:05.515393-05	2026-01-12 00:00:48.725499-05
0b37c8b8-374c-48e8-b1eb-88092842b14c	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"password": "clave123", "username": "usuario_demo"}	AVAILABLE	\N	\N	\N	\N	\N	2026-01-14 04:32:03.876576-05	2026-01-14 04:32:03.876576-05
6890b937-c93b-4b19-a0c6-31166589c3c2	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	5579e49a-5436-4bf8-8a96-35ae51366cbc	7621162350	NoroPayments	2026-01-14 04:32:23.531642-05	2026-01-14 04:33:20.278035-05	2026-01-11 16:00:55.837874-05	2026-01-14 04:33:20.278035-05
204ceaa2-4c4e-4186-86ee-3a2c73868e10	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "pass001", "start_at": "2026-01-01", "username": "user001", "starts_at": "2026-01-01", "expires_at": "2026-12-31", "external_id": "extn050"}	DELIVERED	83d97c2c-c3d0-4c1d-942b-b78df4f03085	7621162350	NoroPayments	2026-01-14 04:34:58.908412-05	2026-01-14 04:35:24.966431-05	2026-01-11 04:47:25.561148-05	2026-01-14 04:35:24.966431-05
0bdf7dc9-0ef7-47d8-a2fe-b8298482506d	fb9d200f-5b61-42b0-924c-b6338b69b478	{"password": "pass001", "start_at": "2026-01-01", "username": "user001", "starts_at": "2026-01-01", "expires_at": "2026-12-31", "external_id": "ext001"}	DELIVERED	715880a8-1002-41fe-9e63-7c410c9f143a	7621162350	NoroPayments	2026-01-14 04:36:48.134597-05	2026-01-14 04:37:12.783461-05	2026-01-11 04:21:49.08015-05	2026-01-14 04:37:12.783461-05
874730f8-74cd-47a8-9f29-1870f024c311	fb9d200f-5b61-42b0-924c-b6338b69b478	{"notes": "nota 1", "title": "Cuenta 1", "password": "p1", "start_at": "2026-01-11", "username": "u1", "expires_at": "2026-02-11"}	DELIVERED	b8726a2c-a7fa-43bb-8149-ca8fbebba8f5	7621162350	NoroPayments	2026-01-14 04:44:21.444782-05	2026-01-14 04:44:50.792702-05	2026-01-11 03:27:36.084773-05	2026-01-14 04:44:50.792702-05
ba685324-a5b6-4dda-ba5d-111007f7832e	11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	{"notes": "nota", "title": "Test Unit", "password": "p", "start_at": "2026-01-10", "username": "u", "expires_at": "2026-02-10"}	DELIVERED	9fca83d2-fe4a-4f23-bcad-4a8d7d12856c	7621162350	NoroPayments	2026-01-14 05:23:56.38701-05	2026-01-14 05:24:39.913274-05	2026-01-10 20:44:58.061881-05	2026-01-14 05:24:39.913274-05
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.products (id, name, description, price, is_active, delivery_type, delivery_payload, created_at, updated_at, code, sku_key, stock_mode, stock_qty, show_stock, delivery_template, unique_purchase) FROM stdin;
a190a60d-ac58-4623-9fe4-70cd785384a0	Bin - CHAT GPT 1 EURO	Paga solo 1 Euro x 1 mes\nValido para 5 Perfiles\nCuenta de empresas	15.00	t	TEXT	{"url": "", "text": "Método Chat GPT 1 Mes x 1 euro (Para 5 cuentas)\\n\\n1. VPN: Países Bajos  (Netherlands) 🇳🇱\\n\\n2. Entra al siguiente Link ya conectado a Países bajos:\\nhttps://chatgpt.com/?promo_campaign=team1dollar#team-pricing\\n\\n3. Inicia sección en una cuenta nueva o una ya registra (pero sin plan)\\n\\n4. Una ves entres selecciona 5 licencias , que es el máximo para la promoción de 1 euro y continuas\\n\\n5. En el metodo de pago agrega tu Paypal o un Paypal creado al momento de cualquier país y añádele  tu tarjeta personal y pagas, solo se te restara 1 Euro en tu moneda local.\\n\\npagas y listo a disfrutar de Chat GPT para máximo 5 cuentas.\\n\\nImportante: al realizar el pago, elimina la tarjeta en la configuración de Chat GPT ó de la cuenta de Paypal para que al mes no te cobren a tarifa estándar que serian mas de 100 euros.", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 16:21:54.908378-05	2026-01-19 16:21:55.002699-05	M00010	000037	SIMPLE	\N	t	\N	f
b232a5dc-39af-47e2-9851-a0a00d5c9a88	🕵️ Foros de Carding	25 Foros Disponibles\nForos Rusos, Gringos e Hispanos\nEncuentra cualquier tipo de material en estos foros\nMantente Actualizado	50.00	t	TEXT	{"url": "", "text": "Foros Carding:\\n\\n1. https://www.sythe.org\\n2. https://cardingcashout.com\\n3. https://cardingsecrets.is\\n4. https://cybercarders.net\\n5. https://altenens.is\\n6. https://playmetodos.net\\n7. https://darknetarmy.io\\n8. https://crdpro.cc\\n9. https://styxmarket.com\\n10. https://linkzone.cc\\n11. https://ascarding.net\\n12. https://crdcrew.cc\\n13. https://carder.market\\n14. https://darkpro.net\\n15. https://exploit.in\\n16. https://carders.biz\\n17. https://cardinglegends.com\\n18. https://carder.su\\n19. https://cardforum.cc\\n20. https://hackforums.net\\n21. https://niflheim.world\\n22. https://validmarket.io\\n23. https://darkforums.io\\n\\nDominios .Onion:\\n\\n1. http://dna777fdlbcv24cx5ctdvydvfa277vgb6wd6w4ztem6cho3kqogi7bqd.onion\\n2. https://dreadytofatroptsdj6io7l3xptbet6onoyno2yv7jicoxknyazubrad.onion/\\n\\n\\nHabla Hispana:\\n\\n1. https://foro.hackhispano.com\\n2. https://forobeta.com", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:29:05.667231-05	2026-01-19 04:29:05.736903-05	T00003	000016	SIMPLE	\N	t	\N	f
11c06a10-7251-4e0b-8cd9-4ab82d775daa	Pantalla Netflix 1 Mes	adecxwxa\nxxwxqx\nxqwxwq	1000.00	t	TEXT	{"url": "", "text": "", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 18:10:15.052389-05	2026-01-22 04:36:13.251971-05	T00017	000039	UNITS	\N	t	\N	t
a627ee3f-ffb8-4ee7-8540-430027d5a90e	MUNDO DE CAOS	1\n2\n4\n3	10.00	f	TEXT	{}	2026-01-13 23:10:38.542357-05	2026-01-19 04:18:03.406904-05	\N	000011	SIMPLE	\N	t	\N	f
be24d2a3-4e9b-4766-864b-4fe946dc1a65	netflix	fwfew\nfewfew\nfewfewf	21.00	t	TEXT	{"url": "", "text": "", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-23 05:35:08.125637-05	2026-01-23 05:35:08.125637-05	W00001	000040	UNITS	\N	t	\N	f
f183f1ae-bd5f-45a7-a229-d2fce3727939	noropayments		0.00	f	TEXT	{}	2026-01-13 23:41:18.276877-05	2026-01-19 04:18:12.680434-05	\N	000012	SIMPLE	0	t	\N	t
055b1bc7-9f90-4a28-a4c0-31c3b70be6c5	💳 Venta de Tarjetas	Crédito y Débito\nSe entregan 100% Lives\nCon todos sus Datos\nCualquier País	25.00	t	TEXT	{"url": "", "text": "Escribe a: @Noropayments para reclamar tus Ccs, toma una captura a esta pantalla y enviame el recibo de pago para proceder con la entrega.", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-08 21:02:37.346636-05	2026-01-19 04:24:28.555287-05	T00001	000001	SIMPLE	\N	t	\N	f
bc890533-ee5e-42f0-9c3c-fb5a97a17020	Bin - Tango (ve chicas ricas)	¡Aprende a generar ingresos mientras ves chicas!\nMujeres Ricas\nVe Chicas sin pagar nada	15.00	t	TEXT	{"url": "", "text": "Tango - Método + Bin\\n\\n🔢 Bin: 5306917121xxxxxx|11|2026  CVV:000\\n💳 Marca: MASTERCARD \\n📦 Tipo: DEBITO\\n🎚 Nivel: STANDARD\\n🏦 Banco: BANCOLOMBIA, S.A.\\n🌍 País: COLOMBIA 🇨🇴\\n📍 VPN: Colombia 🇨🇴\\n\\n🔥 ¡Solo con Lives! 🔥\\n\\n📝 Pasos a seguir:\\n\\n1️⃣ Ingresa a: https://tango.me 🌐 (Desde el navegador) Pc ó Móvil\\n2️⃣ Crea una cuenta o inicia sesión 🆕🔑\\n3️⃣ Modifica tu perfil con datos ficticios y agrega una imagen 🖼👤\\n(Esto hace que la app te vea como un usuario real)\\n4️⃣ Navega por la Web durante 5-10 min ⏳👀\\n(Mira chicas, entra a transmisiones, etc.)\\n5️⃣ Ve a la opción de comprar monedas y selecciona de $10 a $20 USD 💰💳\\n(Usa los datos de tu Live con el bin que proporcione, y mismo nombre del perfil de la cuenta y CVV: 000)\\n\\n⚠️ Importante:\\n\\n· Algunas Lives pedirán 3D Secure, pero igual pagarán ✅🔒.\\n  (Solo cierra la ventana del 3D y sigue) (En algunos casos pagan)\\n· Otros no pedirán 3D ❌🔓.\\n\\nTodo depende del saldo de la Live\\n\\n🕒 Después de comprar monedas:\\n\\n7️⃣ Deja reposar la cuenta por 24 horas 🕛😴\\n(Sigue viendo transmisiones durante 5min y cierra la cuenta)\\n\\n8️⃣ Si tras 24h la cuenta sigue activa 🎉✅\\n(¡Buenas noticias! Ya puedes gastar las monedas)\\nEn otro caso le pueden dar ban a la ceunta por saspecha de fraude o si el banco reembolsa el dinero.\\n\\n💸 Cómo retirar:\\n\\n9️⃣ Negocia con una chica que transmita en Tango que tenga mas de 20k ganados 💃🤝\\n(Recomendación: Compra su WhatsApp por un precio razonable y negocia por ahí con ella)\\n\\n💡 Consejo:\\n\\n· No te saldrá con la primera, seguro la chica no quiera o simplemente al pasarle el dinero te bloquee de todos lados y te estafe! 🚫🦹\\n· Pero siempre encontraras a una seria que quiera ganar un dinero extra y no coma una sola vez, cuando encuentres una chica seria, todo fluye mejor 🤝✨\\n\\n🔟 Ella te pasará el dinero a tu cuenta según lo acordado 💵⬅️📲\\n\\n(Es bueno que tengas varias chicas no solo 1 ya que le pueden bloquear la cuenta a ella por fraude si lo haces muy constantemente) y perderian los 2.\\n\\n🧠 Consejos extras:\\n\\n· 🎁 Comienza con regalos de montos bajos (600 monedas).\\n· 💳 Si una tarjeta paga, úsala hasta que queden sin fondos (algunas llegan a pagar hasta mas de $200 USD).\\n· 🔄 Crea varias cuentas (agregar muchas tarjetas en una cuenta puede banear la cuenta).\\n· ⏳ Deja reposar 24h para evitar reembolsos del banco 🏦❌\\n\\n¡Si no hay reembolso, el dinero es tuyo! 🤑🎉\\n\\n¿Listo para probar? 🚀💥", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 15:45:47.381228-05	2026-01-19 15:45:47.463607-05	M00004	000031	SIMPLE	\N	t	\N	f
62d5158d-b1f9-41a0-8435-7056fc32219a	Aliexpress Con CCS	Incluye 3 Shop de Ccs\nSirve desde cualquier país siguiendo los pasos	30.00	t	TEXT	{"url": "", "text": "Metodo Aliexpress con Ccs\\n\\nRequisitos de tarjeta de AliExpress:\\n\\nVPN: USA o de Donde sea la tarjeta\\n(Prueba usarlo con tarjetas de tu país si deseas)\\n\\n💳 Tarjeta necesaria: Fullz\\n\\n🖥 Ccs Shop: Novacc.cx\\n \\nPasos necesarios para el método de AliExpress:\\n\\n1.  Vaya a Novacc.cx y compre una Ccs Debito/Crédito con las características Fullz.\\n\\n2. Después de comprar una tarjeta Debito/Crédito vaya a Aliexpress.com y cree una cuenta nueva, con los datos de la tarjeta.\\n\\n3. El correo con el que cree la cuenta de Aliexpress debe ser con el mismo nombre de la tarjeta, ejemplo: si la tarjeta tiene de nombre: Jose Diaz, el correo podría ser el siguiente o algo similar: Josediaz2025@gmail.com y recuerda verificar la cuenta.\\n\\n4. Navega unos 20 minutos por la página, esto con la finalidad de que parezcas un usuario real, luego añade los producto que deseas comprar al carrito, comienza con compras mínimas de entre 50 a 100 USD y ve al carrito.\\n\\n5. Ingresa tus datos de dirección de entrega y número de telefono.\\n\\n6. Agrega la tarjeta de pago de Debito/Crédito siempre utilizando la tarjeta fullz de Novacc.cx qué hasta el momento no ha dado mejor resultado.\\n\\nHaga clic en \\"Agregar tarjeta de pago\\". Agregue los detalles de la tarjeta de pago que desea usar. En el número telefonico de la tarjeta puede agregar el de la tarjeta o uno adquirido de: https://temp-number.org del pais de la tarjeta.\\n\\n7. Por último, pulsa \\"pagar ahora\\".\\n\\n¡Confirma y realiza tu pedido! Recibirás una confirmación poco después de realizarlo\\n_______________________________________________\\n\\nSiguiendo estos pasos, podrás usar la tarjeta de AliExpress y realizar compras sin dejar rastro. \\n\\nRecuerda usar una VPN conectada al mismo país que la tarjeta que usas (por ejemplo, si la tarjeta es de EE. UU. conecta tu VPN a un servidor estadounidense) y siempre usa tarjetas de Novacc.cx para máxima seguridad.\\n\\n¡Felices compras! 👍\\n\\nGenerador: Norotools.site", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 16:19:10.676906-05	2026-01-19 16:19:10.759386-05	M00009	000036	SIMPLE	\N	t	\N	f
a56ffe4a-3233-4e5e-9700-5cf45f92e9df	150 IDS mexicanos (INES)	Ambos Lados\nMás de 1000 Disponibles	5.00	t	TEXT	{"url": "", "text": "Escribe a @Noropayments para que enviarte el contenido.\\n\\nSe te enviaran 150 INES Mexicanos\\n\\nIMPORTANTE: Toma una captura de esta pantalla y envíamela.", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 14:52:26.030509-05	2026-01-19 14:52:26.135159-05	T00013	000026	SIMPLE	\N	t	\N	f
71af3a91-a689-49f4-bb6b-b4afa279bcf4	Panel Onlyfans	Precios Económicos por cuentas con saldo\nEntrega por link\nSaldo de 50, 100 y 200 USD\nRevende cuentas de Onlyfans\nLos mejores precios del Mercado	20.00	t	TEXT	{"url": "", "text": "Panel Onlyfans\\n\\n\\"https://onlyfap.city\\"\\n\\n\\"Ingresa al link.\\"", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 14:54:48.912411-05	2026-01-19 14:54:49.003943-05	T00014	000027	SIMPLE	\N	t	\N	f
e74dc626-fec8-49c9-97df-bb69aa9c895d	💳 Venta de Tarjetas	Crédito y Débito\nSe entregan 100% Lives\nCon todos sus Datos\nCualquier País (pregunta disponibilidad)	21.00	t	TEXT	{"text": "Escribe a @Noropayments para enviarte el contenido.\\nSe te enviara 1 CCS validada.\\nIMPORTANTE: Toma una captura de esta pantalla y envíamela."}	2026-01-08 21:02:37.346636-05	2026-01-13 19:31:19.900791-05	M00002	000009	SIMPLE	0	f	\N	t
d48ce70f-0f4a-4c55-98f1-57c433cb9fba	Bin - Chat GPT Plus 1 mes	Solo 1 mes por 0 USD\nSaca las cuentas que quieras\nIp: Korea	15.00	t	TEXT	{"url": "", "text": "Bin: \\n\\n625814260209xxxx|04|2029|gen\\n624413629338xxxx|09|2034|gen\\n624413629338xxxx|03|2030|gen\\n\\nIP: Corea del Sur 🇰🇷\\n\\n1- Crea una cuenta nueva en: https://chatgpt.com\\n2- Vaya a la sección Precios y seleccione la versión personal 1 mes por 0 USD\\n4- Haga clic en Iniciar con prueba gratuita durante 1 mes y los datos del pago el pago.\\n5- Boom Disfruta de la cuenta premium\\n\\nUtilice Cards Gen o Live Cards y prueba gratuita\\n\\nGenerador de CC: Norotools.site\\n\\nDirección: https://www.fakexy.com/fake-address-generator-kr\\n\\nCompleta con estos datos:\\n\\nFull Name:  명인규\\nStreet:  144 Deokso-ri, Wabu-eup\\nCity/Town:  남양주시\\nState/Province/Region:  경기도\\nZip/Postal Code:  12207", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 15:40:07.274248-05	2026-01-19 16:10:36.833092-05	M00003	000030	SIMPLE	\N	t	\N	f
d3a83b4d-7b2d-404b-bb5f-c1a8a20bd2dd	📧 Paneles de Emails Temporales	20 Paneles Disponibles\nEmails temporales y herramientas\n100% funcionales\nRecibe Códigos al instante	15.00	t	TEXT	{"url": "", "text": "Lista de Paneles de Email Temporales ordenada por fiabilidad (2026)\\n\\n★★★★★ (Top recomendados)\\n1. protonmail.com\\n2. correotemporal.org\\n3. simplelogin.com\\n4. anonaddy.com \\n5. burner.com   \\n\\n★★★★ 4 Estrellas\\n6. temp-mail.org \\n7. 10minutemail.com   \\n8. guerrillamail.com \\n9. maildrop.cc \\n10. emailondeck.com \\n\\n★★★ 3 Estrellas\\n11. yopmail.com \\n12. mailinator.com \\n13. internxt.com \\n14. tmailor.com\\n15. tempmail.net\\n\\n★★ 2 Estrellas\\n16. mailnesia.com \\n17. 20minutemail.com \\n18. getnada.com  \\n19. strip-mail.com \\n20. throwawaymail.com", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:42:39.770845-05	2026-01-19 04:42:39.834459-05	T00009	000022	SIMPLE	\N	t	\N	f
b578aeef-b76a-472f-9221-1784fe43d590	Bin - Motion Array 1 mes	Descarga recursos sin Limites\nDiseña como un experto	15.00	t	TEXT	{"url": "", "text": "Bin Motion Array\\n\\n🔢 𝘉𝘪𝘯: 414740\\n💳 𝘉𝘳𝘢𝘯𝘥: VISA\\n📦 𝘛𝘺𝘱𝘦: CREDIT\\n🎚 𝘓𝘦𝘷𝘦𝘭: TRADITIONAL\\n🏦 𝘉𝘢𝘯𝘬: JPMORGAN CHASE BANK N.A.\\n🌍 𝘊𝘰𝘶𝘯𝘵𝘳𝘺: UNITED STATES 🇺🇸\\n\\nBin:\\n414740044232xxxx|10|2029|Gen\\n\\nVpn: UNITED STATES 🇺🇸 \\n \\nhttps://motionarray.com\\n\\nUbicación:\\n\\nCalle: 2345 Rodeo Dr\\nCiudad: Beverly Hills\\nCódigo Postal: CA 90210\\n\\nGenerador: Norotools.site", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 16:14:00.183512-05	2026-01-19 16:14:00.272958-05	M00006	000033	SIMPLE	\N	t	\N	f
2656c42a-d164-45a7-a240-ab18ef947b1e	Producto 13	Descripcion del producto 13\nDetalles adicionales	24.00	f	FILE	{"filename": "archivo_13.pdf", "fallback_url": "https://example.com/fallback/archivo-13", "telegram_file_id": "PENDING_FILE_ID"}	2026-01-08 21:02:37.346636-05	2026-01-19 04:18:24.42492-05	\N	000004	SIMPLE	\N	t	\N	f
378be0ae-f326-41cb-930f-8e2bae27ff69	Producto 03	Descripcion web 03\nDetalles adicionales	18.00	f	LINK	{"url": "https://example.com/entrega/web-03", "note": "Acceso web"}	2026-01-08 21:02:37.346636-05	2026-01-19 16:09:56.369323-05	\N	000006	SIMPLE	\N	t	\N	f
968e685b-3967-4268-b7a7-b97d57e125fa	🎬 Paneles Streaming	17 Paneles Disponibles\nOpciones de plataformas\nEntrega inmediata\nMás económicos\n100% funcionales	15.00	t	TEXT	{"url": "", "text": "Paneles Streaming:\\n\\n1. https://www.nalydstore.com\\n2. https://ayalanet.com\\n3. https://cuentasfull.com\\n4. https://www.z2u.com\\n5. https://getcheap.net (Netflix)\\n6. https://app.spliiit.com/\\n7. https://www.cardbear.com\\n8. https://ggpick.com\\n9. https://coosub.com\\n10. https://www.gamsgo.com\\n11. https://softboost.mysellauth.com\\n12. https://resellshop.cc\\n13. https://resellme.xyz\\n14. https://uhqstock.com\\n15. https://snakemarket.cc\\n16. https://premiumsupermarket.mysellauth.com\\n17. https://nebulaamarket.mysellauth.com", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:36:35.071921-05	2026-01-19 04:36:35.171446-05	T00007	000020	SIMPLE	\N	t	\N	f
bd88dd59-1004-4158-86f6-7b3b18a27d37	Shein Con CCS	Incluye 3 Shop de Ccs\nIncluye 3 bins de USA\nCuenta nueva o con historial	30.00	t	TEXT	{"url": "", "text": "Método Shein con Ccs\\n\\n🔢 𝘉𝘪𝘯: 486236\\n💳 𝘉𝘳𝘢𝘯𝘥: VISA\\n📦 𝘛𝘺𝘱𝘦: CREDIT\\n🎚 𝘓𝘦𝘷𝘦𝘭: TRADITIONAL\\n🏦 𝘉𝘢𝘯𝘬: CAPITAL ONE, NATIONAL ASSOCIATION\\n🌍 𝘊𝘰𝘶𝘯𝘵𝘳𝘺: UNITED STATES 🇺🇸\\n\\n🔢 𝘉𝘪𝘯: 480012\\n💳 𝘉𝘳𝘢𝘯𝘥: VISA\\n📦 𝘛𝘺𝘱𝘦: CREDIT\\n🎚 𝘓𝘦𝘷𝘦𝘭: TRADITIONAL\\n🏦 𝘉𝘢𝘯𝘬: BANK OF AMERICA - CONSUMER CREDIT\\n🌍 𝘊𝘰𝘶𝘯𝘵𝘳𝘺: UNITED STATES 🇺🇸\\n\\n🔢 𝘉𝘪𝘯: 546540\\n💳 𝘉𝘳𝘢𝘯𝘥: MASTERCARD\\n📦 𝘛𝘺𝘱𝘦: DEBIT\\n🎚 𝘓𝘦𝘷𝘦𝘭: ENHANCED\\n🏦 𝘉𝘢𝘯𝘬: TRUIST BANKS, INC.\\n🌍 𝘊𝘰𝘶𝘯𝘵𝘳𝘺: UNITED STATES 🇺🇸\\n\\nVPN: USA\\n\\nRequisitos:\\n\\n1. VPN\\n2. Un teléfono\\n3. Vas a necesitar una Ccs, puedes ser una cc simple de nivel 1 Use uno de estos bins: 486236, 480012, 546540\\n\\nPaso a Paso:\\n\\n1. Descarga shein en el teléfono (importante) y crea una cuenta con ubicación a Estados Unidos.\\n\\n2. Una ves creada tu cuenta navega por shein viendo productos y precios unos 10 minutos, y pasiencia, lo que te va hacer tener éxito en este método es hacerlo con calma, sin vincular ninguna Ccs aún, ni haga ningún pedido durante el primer día.\\n\\n3. Haciendo la compra\\n\\n● Agregue un producto al carrito, siga los pasos hasta el punto de ingresar tu cc, ingrese cada detalle.\\n● Agregue la dirección de entrega, puedes utilizar algún servicio de paquetería o enviarlo a tu dirección eso ya queda en tus manos.\\n● Complete el pedido.\\n\\n \\nInformación La clave para este método es hacerlo desde un teléfono, dejar la cuenta reposar y hacerlo con los bins correctos. Si cumple con estos tres puntos obtendrás éxito y podrás pedir todo lo que quieras hasta que la cc quede sin fondo.\\n\\nSHOPS DE CC:\\n\\n1. https://novacc.cx    (Se usa para este método)\\n2. https://mydb.cc     Regalo adicional\\n3. https://ccartel.cc    Regalo adicional", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 16:17:54.401367-05	2026-01-19 16:17:54.476927-05	M00008	000035	SIMPLE	\N	t	\N	f
2e75fbd8-5602-4499-a8b8-17825f6ed371	too por aca bien	ffasfafefe\nfafasfsafas\nfefewfewfew\nfwfewfewfew\nfewfwefwef\nfwefewfewfw\nfwefwefwefew\nfwfwfwfewfw	0.00	f	TEXT	{}	2026-01-14 00:31:48.46893-05	2026-01-19 04:18:10.717297-05	\N	000014	SIMPLE	0	t	\N	f
d6885302-6754-4aa5-8f1d-f676b313efc1	Producto 01	Descripcion del metodo 01\nDetalles adicionales	15.00	f	TEXT	{"text": "Guia paso a paso\\nAcceso inmediato"}	2026-01-08 21:02:37.346636-05	2026-01-19 16:10:23.763524-05	\N	000008	SIMPLE	978	t	\N	f
1c81b811-ba5f-474e-ae84-03535202dd71	🔗 Links de CCS Shop	36 páginas para comprar tarjetas reales\n100% Verificadas\nDebito/Crédito\nBin de cualquier País\nPrecios de las Ccs varian según la página	90.00	t	TEXT	{"text": "Links Shop Ccs:\\n1. https://00code.fm\\n2. https://cczauvr.sale\\n3. https://novacc.cx\\n4. https://mydb.cc\\n5. https://robinshop.su\\n6. https://ronaldo-club.to\\n7. https://ccartel.cc\\n8. https://blackpass.link\\n9. https://cerberux-club.to\\n10. https://tox3.in\\n11. https://centercc.info\\n12. https://icard-cc.info\\n13. https://stuffcc.info\\n14. https://wrabbit.info\\n15. https://wstreetcc.top\\n16. https://targetcc.info/\\n17. https://ultimate-shop.ru\\n18. https://cardingcashout.com\\n19. https://darkwebcc.com\\n20. https://torbag.pw\\n21. https://vortiga-shop.to\\n22. https://prozone.cc\\n23. https://www.lukicrown.to\\n24. https://stashpatrick.pl\\n25. https://rosecc.pw\\n26. https://voug.ht\\n27. https://styxmarket.news\\n28. https://realvalid.io\\n29. https://bidencash.eu\\n30. https://russianmarket.onl\\n31. https://castrocvv.cc\\n32. https://jerryclub.cc\\n33. https://moneycounter.cc\\n34. https://authorize.is\\n35. https://vclub.su\\n36. https://uniccshop.ru"}	2026-01-08 21:02:37.346636-05	2026-01-13 21:45:40.104401-05	M00001	000003	SIMPLE	0	f	\N	t
e90f566c-74be-465d-acb4-2a636fffb149	Paneles Worm GPT	7 Paneles Disponibles\nChats GPTs  Malvados\nIA sin restricciones\nTe da cualquier información	20.00	t	TEXT	{"url": "", "text": "IA y GPT de la Deep Web:\\n\\n1. https://evilgpt.in\\n2. https://video.evilgpt.in\\n3. https://www.wormgpt.live\\n4. https://t.me/DarkGPT_tg_bot?start=_tgr_EYBM4KA1N2Mx\\n5. https://fraudgpt.org\\n6. https://www.hackaigc.com\\n7. https://wormgpt.net", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 15:21:54.112185-05	2026-01-19 15:21:54.175456-05	T00016	000029	SIMPLE	\N	t	\N	f
2917d506-292d-41e0-9dce-14f4f251bbc5	Producto 11	Descripcion del producto 11\nDetalles adicionales	22.00	f	LINK	{"url": "https://example.com/entrega/shop-11", "note": "Acceso web"}	2026-01-08 21:02:37.346636-05	2026-01-19 04:18:13.75951-05	\N	000005	SIMPLE	\N	t	\N	f
86b71c5c-f34e-4c90-a069-8f9befd5d8ac	Curso | Carding y Bineo	Que es un BIN 🔢 - Entiende la base de todo\nExtrapolación de Tarjetas 💻 - El arte de predecir números\nGenerador de Tarjetas 🛠 - Herramienta clave\n¿Que es un VPN? 🌐 - Navegación segura y anónima\nTarjetas (Lives) ⚡️ - ¿Por qué son la mejor opción?\nShop Ccs - Explicación y como funcionan\nPaneles SMM, SMS, EMAIL\nSoporte ✔️ - Resuelve tus dudas	50.00	t	TEXT	{"url": "", "text": "\\"Toca el link para enviar solicitud y envia captura a @Noropayments para ser aceptado\\"\\nhttps://t.me/+fwPd5z3v22EzZmJh\\n\\"Acceso al Curso Cardin y bineo\\"", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 16:57:22.088953-05	2026-01-19 16:57:22.210127-05	V00001	000038	SIMPLE	0	t	\N	t
79f4085b-c38a-40de-a4a2-951d1caa0142	📩 Paneles SMS	22 Paneles Disponibles\nRecibe Códigos al instante\nSe Entrega por link\n100% funcionales	15.00	t	TEXT	{"url": "", "text": "Lista de Paneles SMS ordenada por fiabilidad (2026)\\n\\n★★★★★ (Top recomendados)\\n1. sms-activate.io \\n2. smspinverify.com \\n3. juicysms.com   \\n4. temp-number.org  \\n\\n★★★★ 4 Estrellas\\n5. textverified.com \\n6. majorphones.com \\n7. vsimapp.com \\n8. quackr.io  \\n9. onlinesim.io \\n\\n★★★ 3 Estrellas\\n10. sonetel.com \\n11. zadarma.com \\n12. tempsmss.com\\n13. smska.us\\n\\n★★ 2 Estrellas\\n14. smspva.com  \\n15. virtunum.com \\n16. app.smsvirtual.org \\n17. online.smsvirtual.app \\n18. sms-receive.net \\n19. hs3x.com  \\n20. numberforsms.com \\n21. getfreesmsnumber.com \\n22. receive-smss.com\\n\\n\\nAPPS GOOGLE PLAY:\\n\\n1. https://play.google.com/store/apps/details?id=com.receive.sms_second.number\\n2. https://play.google.com/store/apps/details?id=online.smsvirtual.app\\n\\n\\nR e g a l o\\n\\nCompra de números virtuales:\\n\\n1. https://yesim.app\\n2. https://www.callcentric.com\\n3. https://www.smspool.net\\n4. https://esimplus.me", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:31:54.064562-05	2026-01-19 04:31:54.138526-05	T00005	000018	SIMPLE	\N	t	\N	f
86e1c777-9975-489d-aa62-56e86cca7f1b	Bin - Wix 1 mes	Crea y diseña sin limites\nDiseña como un experto\nCrea tu Página web	15.00	t	TEXT	{"url": "", "text": "BIN - Wix\\n\\n🔢 𝘉𝘪𝘯: 414740\\n💳 𝘉𝘳𝘢𝘯𝘥: VISA\\n📦 𝘛𝘺𝘱𝘦: CREDIT\\n🎚 𝘓𝘦𝘷𝘦𝘭: TRADITIONAL\\n🏦 𝘉𝘢𝘯𝘬: JPMORGAN CHASE BANK N.A.\\n🌍 𝘊𝘰𝘶𝘯𝘵𝘳𝘺: UNITED STATES 🇺🇸\\n\\nBin:\\n414740044232xxxx|10|2029|Gen\\n\\nVpn: UNITED STATES 🇺🇸 \\n\\nhttps://www.wix.com/\\n\\nUbicación:\\n\\nCalle: 2345 Rodeo Dr\\nCiudad: Beverly Hills\\nCódigo Postal: CA 90210\\n\\nGenerador: Norotools.site", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 16:15:36.850401-05	2026-01-19 16:16:33.012506-05	M00007	000034	SIMPLE	\N	t	\N	f
3c313338-9900-45ad-bd59-fa8ba6d72f6a	Producto 07	Descripcion web 07\nDetalles adicionales	18.00	f	EXPIRING_LINK	{"url": "https://example.com/entrega/web-07", "note": "Acceso temporal"}	2026-01-08 21:02:37.346636-05	2026-01-19 16:09:57.451202-05	\N	000007	SIMPLE	\N	t	\N	f
11c7897d-fe2a-4896-a9b5-8fe9a7bd4abc	Producto 04	Descripcion del VIP 04\nDetalles adicionales	30.00	f	TEXT	{"url": "", "text": "", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-08 21:02:37.346636-05	2026-01-19 16:58:07.687821-05	\N	000002	UNITS	\N	t	🔑 ACCESO\n\n👤 Usuario: junior\n🔒 Contraseña: noro123\n🗓 Inicio: hoy\n⏳ Expira: mañana	f
b57ab6b6-eb8e-43d3-8cd6-a0e11c698637	gratis		0.00	f	TEXT	{}	2026-01-13 23:50:46.315733-05	2026-01-19 16:10:00.643509-05	\N	000013	SIMPLE	0	t	\N	f
8c06f62e-5698-43ad-9848-a843061394df	Paneles Mercado Negro	12 Paneles Disponibles\nDominios de la Dark Web\n100% funcionales\nVenta de todo, con envíos internacionales	15.00	t	TEXT	{"url": "", "text": "Armas y Mercado Negro:\\n\\n1. http://agshopdpakxd4d22wo5agavun63yss3drrtu32d7icfhmnrdumnlrhad.onion\\n2. http://tormarwg3uwpk2ielzpivbmzcskc3wowjjmwhrhc67cafyyhmyovkvid.onion\\n3. http://torgunsh5s6azxmz47a6yhksy6e4yygbsb5kyabwcxsphnhyknl7uyad.onion\\n4. http://alpha6fwbu5fh5w4btl7c4fbfvfortehsi63d3bbacb4cedqittmnnqd.onion\\n5. http://cardxqffgm2y6ktl6bgnk4mfhdns6xjymo6f62olou2o34uyzrhaqbid.onion\\n6. http://fast7jkutkttyy6fy4ezlayyohpwrdw7nkblxavunpas32gv5xxgfrad.onion\\n7. http://ravenxoqr3762a7irmrvt54khdemuzsbqjj4glajquwphz2ytzw5tcqd.onion\\n8. http://bitcardkpomtp6vdgth4aat3yblm75kwcklsjr4grpdpmhu3sh67ikyd.onion\\n9. http://ddenjrrcjmltjgidxbtqrqbnyhunhlo4dhb6oiy63n4sk6ekzg5aodqd.onion\\n10. http://blackf7ifehflns4bpg7ufnshfwffrvab5xzzxh2ubzr7mdwns3uuhid.onion\\n11. Card King: http://qdoengfklui3263cymghxqiihxfmmjggzjicqqy5gcc72tai2xtengqd.onion\\n12. Light Money: http://lmoneylmwki7lv4vtijsqr23p6odzpyaw3uffsbm6f5e3osy3wkrfvad.onion", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:44:43.664891-05	2026-01-19 04:44:43.724584-05	T00010	000023	SIMPLE	\N	t	\N	f
c2a9b2e2-569e-4381-9315-09030bba2827	Checkers	4 Checkers 100% funcionales\nSolo la información, no se da acceso a los checkers\nProbados y recomendados	10.00	t	TEXT	{"url": "", "text": "1. CHECK VIP ONE\\n\\nDueño: @RECARGASVIPONE\\nSeller: @NETCOLVIP\\nGrupo: https://t.me/checkvipone\\nPágina del Checker: https://netcol.pro\\n\\n\\n2. ARMY LEGACY CHK\\n\\nDueño: @BlackCloud12\\nSeller: @PhamtomDark\\nSeller: @PandoraBox33\\nCanal: https://t.me/ArmyLegacy\\nPágina del Checker: https://armylegacychk.xyz\\n\\n\\n3. MAGICK CHECKER\\n\\nTelegram del Dueño y seller: @MagickCheckerOficial\\nWhatsapp Seller: https://wa.me/573124124941\\nInfo Bins: @MagickInfoBinBot\\nGrupo publico: t.me/MagickCheckerGroupPublic\\nPágina del Checker: https://magickchecker.com\\n\\n\\n4. DEMONCHEK\\n\\nTelegram del Dueño y seller: @RiasDemon\\nPágina del Checker: https://demoncheck.xyz\\n\\n\\nAca tienen un checker FREE funciona al dia de hoy\\n\\nSOLO GATE AMAZON:\\nhttps://fwchecker.online/free", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:47:00.907783-05	2026-01-19 04:47:00.967934-05	T00011	000024	SIMPLE	\N	t	\N	f
4ef04bc1-c3a0-47a1-81c6-f87b79128496	🔗 Links de CCS Shop	36 páginas para comprar tarjetas reales\n100% Verificadas\nDebito/Crédito\nBin de cualquier País\nPrecios de las Ccs varian según la página	50.00	t	TEXT	{"url": "", "text": "Links Shop Ccs:\\n\\n1. https://00code.fm\\n2. https://cczauvr.sale\\n3. https://novacc.cx\\n4. https://mydb.cc\\n5. https://robinshop.su\\n6. https://ronaldo-club.to\\n7. https://ccartel.cc\\n8. https://blackpass.link\\n9. https://cerberux-club.to\\n10. https://tox3.in\\n11. https://centercc.info\\n12. https://icard-cc.info\\n13. https://stuffcc.info\\n14. https://wrabbit.info\\n15. https://wstreetcc.top\\n16. https://targetcc.info/\\n17. https://ultimate-shop.ru\\n18. https://cardingcashout.com\\n19. https://darkwebcc.com\\n20. https://torbag.pw\\n21. https://vortiga-shop.to\\n22. https://prozone.cc\\n23. https://www.lukicrown.to\\n24. https://stashpatrick.pl\\n25. https://rosecc.pw\\n26. https://voug.ht\\n27. https://styxmarket.news\\n28. https://realvalid.io\\n29. https://bidencash.eu\\n30. https://russianmarket.onl\\n31. https://castrocvv.cc\\n32. https://jerryclub.cc\\n33. https://moneycounter.cc\\n34. https://authorize.is\\n35. https://vclub.su\\n36. https://uniccshop.ru", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:27:41.800782-05	2026-01-19 04:27:41.904153-05	T00002	000015	SIMPLE	\N	t	\N	f
a1fa6385-eea5-4b95-a2b9-f4cd3d02d3aa	+120 Grupos de Telegram	100% activos\nSe están incluyendo más a medida que se consigan\nPodrás publicar lo que vendes o comprar material\nPodrás publicar lo que vendes o comprar material	5.00	t	TEXT	{"url": "", "text": "url: \\"https://t.me/+hY7KZi-LzzIwMGZh\\"\\nnote: \\"Ingresa al link y espera aprobación.\\"", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:48:44.989111-05	2026-01-19 04:48:45.064991-05	T00012	000025	SIMPLE	\N	t	\N	f
fb9d200f-5b61-42b0-924c-b6338b69b478	Producto 05	Descripcion del VIP 05\nDetalles adicionales	30.00	f	TEXT	{"url": "", "text": "", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-08 21:02:37.346636-05	2026-01-19 16:58:06.683092-05	\N	000010	UNITS	\N	t	🔑 DATOS DE INICIO DE SESIÓN\n👤 Usuario: {{username}}\n🔒 Contraseña: {{password}}\n	f
026d7d47-d1f9-41ae-98f0-75125583de7f	Bin - Vecteezy Anual	Descarga recursos sin Limites\nDiseña como un experto	15.00	t	TEXT	{"url": "", "text": "Método + Bin Vecteezy anual\\n\\n\\n🔢 𝘉𝘪𝘯: 530691\\n💳 𝘉𝘳𝘢𝘯𝘥: MASTERCARD \\n📦 𝘛𝘺𝘱𝘦: DEBIT\\n🎚️ 𝘓𝘦𝘷𝘦𝘭: STANDARD \\n🏦 𝘉𝘢𝘯𝘬: BANCOLOMBIA \\n🌍 𝘊𝘰𝘶𝘯𝘵𝘳𝘺: COLOMBIA \\n\\n530691724851xxxx|07|27|rnd\\n\\nVPN: Colombia \\n\\nMétodo con (Lives)\\n\\n• Pasos a seguir:\\n\\n1. Dirígete a la página oficial de Vecteezy: https://es.vecteezy.com\\n\\n2.  Regístrate con correo nuevo, puede ser con Google ó Correo y contraseña.\\n\\n3. Una vez registrado ve a: (Mi Cuenta) y (Suscripción y facturación)\\n\\n4. Luego seleccionas tu plan mensual o anual.\\n\\n5. En la pantalla de pago seleccionas: \\n\\nPaís: Colombia\\nCódigo Postal: 110151\\nNombre de la tarjeta: Mike castro\\nCvv: 000\\n\\n6️⃣. Agrega tarjetas hasta que te pague la suscripción anual.\\n\\n7️⃣. Puede ser un poco tardado dependiendo de si las Lives tengan saldo o no, y también de dónde saque las lives.\\n\\nGenerador: Norotools.site\\n\\n👍 Que lo disfrutes 🍾🥂", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 15:48:33.242325-05	2026-01-19 15:48:33.317814-05	M00005	000032	SIMPLE	\N	t	\N	f
3de71e85-4589-4beb-ae58-91d9820b6008	Panel SSN y Pasaportes	2 Paneles Disponibles\nEntrega por link\nConsigue pasaportes y SSN de todo tipo\nCualquier País\nRevende y Genera ingresos	15.00	t	TEXT	{"url": "", "text": "Paneles SSN y Pasaportes\\n\\n1. https://www.idgod.ph\\n2. https://xilo.in", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 14:56:14.25381-05	2026-01-19 14:56:14.316605-05	T00015	000028	SIMPLE	\N	t	\N	f
cc9b1681-086f-4eff-88d1-7bfea1a433e2	📣 Paneles SMM	33 paneles Disponibles\nPara Subir de seguidores en redes\nTodos están activos y listos para usar\nCompra y vende seguidores	15.00	t	TEXT	{"url": "", "text": "Lista de Paneles SMM ordenada por fiabilidad (2026)\\n\\n★★★★★ (5 Estrellas)\\n1. useviral.com         \\n2. mediamister.com       \\n3. sidesmedia.com         \\n\\n★★★★ (4 Estrellas)\\n4. popularup.com  \\n5. buythefans.com/es\\n6. global-smm.com\\n7. instante.net \\n8. buzzoid.com \\n9. twicsy.com  \\n10. stormlikes.com \\n11. growthoid.com  \\n12. viralyft.com       \\n13. trollishly.com      \\n\\n★★★ (3 Estrellas)\\n14. smmhype.com\\n15. marketfollowers.com  \\n16. wksmm.com \\n17. followdeh.com/en  \\n18. rivallostream.com \\n19. bestsmmprovider.com\\n20. socialwick.com   \\n21. getafollower.com \\n22. poprey.com  \\n23. stellarlikes.com  \\n24. amediasocial.com \\n\\n★★ (2 Estrellas)\\n25. 5smm.com    \\n26. likecobra.com \\n27. smmwolfix.com       \\n28. bulkoid.com          \\n29. hivirals.com   \\n30. famety.net       \\n\\n★ (1 Estrella)\\n31. joysmm.net       \\n32. smmfollows.com    \\n33. justanotherpanel.com  \\n34. socialvirtu.com   \\n\\nhttps://twicsy.com", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:30:32.680973-05	2026-01-19 04:30:32.744524-05	T00004	000017	SIMPLE	\N	t	\N	f
5e8dd0f9-06a7-472c-98ad-885824e564ad	🎁 Paneles Gift Card	12 Paneles Disponible\nRecibe Códigos al instante\nProveedores y paneles\n100% funcionales\nMás económicos	15.00	t	TEXT	{"url": "", "text": "Paneles Tarjetas regalo:\\n\\n1. https://www.gamivo.com\\n2. https://www.loaded.com\\n3. https://cjs-cdkeys.com\\n4. https://www.offgamers.com\\n5. https://dundle.com\\n6. https://k4g.com\\n7. https://www.kinguin.net\\n8. https://gameflip.com\\n9. https://www.cardcash.com\\n10. https://gameseal.com\\n11. https://driffle.com\\n12. https://www.g2g.com\\n13. https://ayalanet.com\\n14. https://www.doctorsim.com", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:33:48.123164-05	2026-01-19 04:33:48.201229-05	T00006	000019	SIMPLE	\N	t	\N	f
2acf5ea0-704f-4ca6-9619-a242a2fe2122	🎮 Paneles de Juegos	24 Paneles Disponibles\nMás económicos\n100% funcionales\nCompra y vende items y recargas	15.00	t	TEXT	{"url": "", "text": "Paneles de juegos\\n\\n1. https://lootbar.gg \\n2. https://www.codashop.com\\n3. https://www.eldorado.gg\\n4. https://www.instant-gaming.com\\n5. https://www.ldshop.gg\\n6. https://www.seagm.com\\n7. https://gameboost.com \\n8. https://www.unipin.com\\n9. https://www.rpgstash.com\\n10. https://bittopup.com\\n11. https://gamefan.la\\n12. https://pagostore.garena.com\\n13. https://hype.games\\n14. https://moogold.com\\n15. https://www.lotkeys.com\\n16. https://www.topuplive.com\\n17. https://www.z2u.com\\n18. https://www.playerauctions.com\\n19. https://zeusx.com\\n20. https://nikgtbm.com (Habbo)\\n21. https://www.fanatical.com\\n22. https://www.greenmangaming.com\\n23. https://www.gamersgate.com\\n24. https://www.gog.com\\n25. https://www.loaded.com", "filename": "", "expires_at": "", "telegram_file_id": ""}	2026-01-19 04:40:19.027105-05	2026-01-19 04:40:19.10041-05	T00008	000021	SIMPLE	\N	t	\N	f
\.


--
-- Data for Name: support_bans; Type: TABLE DATA; Schema: public; Owner: muza
--

COPY public.support_bans (id, telegram_id, reason, banned_at) FROM stdin;
\.


--
-- Data for Name: ticket_messages; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.ticket_messages (id, ticket_id, sender, message_text, telegram_file_id, created_at) FROM stdin;
0ba0124a-b56d-481a-a2df-415b0a05503f	49782852-feca-4986-b744-cd47fbceb0c5	USER	problemas	\N	2026-01-23 03:43:11.408219-05
03dc25d9-e341-492d-a807-5c2a3352ff63	49782852-feca-4986-b744-cd47fbceb0c5	ADMIN	cual	\N	2026-01-23 03:48:39.452546-05
2251a199-b0ff-4075-b9a3-8d7666879d46	49782852-feca-4986-b744-cd47fbceb0c5	ADMIN	\N	AgACAgEAAxkDAAIBWWlzOe2huusQkJgbmdBIZKCyBOGQAAKPC2sbizqYR45f9z48hOsJAQADAgADeAADOAQ	2026-01-23 04:05:47.37476-05
29380feb-857b-447d-a5c1-b74ffe7be66e	cf9586c2-6454-48f3-9387-82c0d0348e47	USER	problema	\N	2026-01-23 04:55:18.926217-05
61cb46b3-d9f7-4396-8880-c555ac696fdb	cf9586c2-6454-48f3-9387-82c0d0348e47	ADMIN	hola en que te ayudo	\N	2026-01-23 04:55:40.873332-05
44eb0c77-74f5-4a8f-8484-6c331379881e	cf9586c2-6454-48f3-9387-82c0d0348e47	USER	problema	\N	2026-01-23 04:55:59.125445-05
7c478f85-5bb9-4590-b176-2e568c6be8c5	cf9586c2-6454-48f3-9387-82c0d0348e47	ADMIN	rok rnsjs	\N	2026-01-23 04:56:30.886453-05
8475d046-bcd0-4efc-9346-bbc75f08b069	cf9586c2-6454-48f3-9387-82c0d0348e47	USER	imagen	\N	2026-01-23 04:56:54.799311-05
3ddf9fb3-8b71-434f-ad40-1c672ca0cc1d	cf9586c2-6454-48f3-9387-82c0d0348e47	ADMIN	fewfw	\N	2026-01-23 04:58:42.713803-05
b6e271ac-cb51-42e1-bf55-f50e04efe254	f0e44ccb-0223-4829-a5d8-e63095a9dfb9	USER	hola	\N	2026-01-23 05:25:32.83923-05
01db9b89-0b21-44fe-8c2f-0911f43a608a	f0e44ccb-0223-4829-a5d8-e63095a9dfb9	ADMIN	en que te ayudo	\N	2026-01-23 05:26:07.239255-05
40648306-72cb-4443-bf37-bcb21c743718	f0e44ccb-0223-4829-a5d8-e63095a9dfb9	ADMIN	deaavsv	\N	2026-01-23 05:29:49.834758-05
7173045d-24b1-4624-94ae-7e9ef7fd3766	f0e44ccb-0223-4829-a5d8-e63095a9dfb9	ADMIN	fwfwefw	\N	2026-01-23 05:29:54.517616-05
97db56ef-b571-4b50-bd59-6365d586bc66	f0e44ccb-0223-4829-a5d8-e63095a9dfb9	USER	puedo enviar	\N	2026-01-23 05:30:04.413743-05
2149ebbe-4957-40c6-84a4-799e90574a0f	cf5626aa-18cb-4579-a828-37ad8c066040	USER	csw	\N	2026-01-23 06:12:43.840867-05
f1c1e219-2557-4829-bc5f-f7e92412a29e	cf5626aa-18cb-4579-a828-37ad8c066040	ADMIN	ewwedwe	\N	2026-01-23 06:13:03.458444-05
206602be-4c24-40ab-949a-9d4716876769	cf5626aa-18cb-4579-a828-37ad8c066040	USER	dwewwrf	\N	2026-01-23 06:13:16.21826-05
13fcf8a0-87a7-40cc-8736-d49fd12afc58	cf5626aa-18cb-4579-a828-37ad8c066040	ADMIN	fwevvr	\N	2026-01-23 06:13:25.859164-05
6741b14d-847b-4adb-8746-c649cd1a2188	cf5626aa-18cb-4579-a828-37ad8c066040	USER	📷 Imagen recibida.	AgACAgEAAxkBAAIBlGlzV_7l6BhuN4zAC2Q5mz571ei8AAKiC2sbizqYR2kVwysywGmhAQADAgADeAADOAQ	2026-01-23 06:14:06.591917-05
f01e456d-1118-42d6-a96f-611a4220ed1d	dc36fb1d-231d-4c19-84ca-8e1af0350901	USER	tengo pronemas ccon asde	\N	2026-01-23 21:40:34.263915-05
6b2aa6ea-5e10-4d22-af8e-9eb4c4f3c61b	dc36fb1d-231d-4c19-84ca-8e1af0350901	ADMIN	hola ens aquerfr	\N	2026-01-23 21:45:34.690187-05
6e66aaf3-141b-46a0-9c77-579e1a60b80b	dc36fb1d-231d-4c19-84ca-8e1af0350901	USER	fsvgerfb	\N	2026-01-23 21:55:29.997992-05
88a1463e-fd73-4da6-b971-87c2e42f7fa0	dc36fb1d-231d-4c19-84ca-8e1af0350901	USER	\N	AgACAgEAAxkBAAIB2ml0NOcQ2s9T-B0EanefNSYTd331AAIvDGsbM62gR05nRXO3m13aAQADAgADbQADOAQ	2026-01-23 21:56:40.419532-05
b1dcc908-ee17-40a0-8c27-fac0da9490c3	dc36fb1d-231d-4c19-84ca-8e1af0350901	ADMIN	ok	\N	2026-01-23 21:57:10.64713-05
706c822b-a738-4633-87ee-5c898970fc82	dc36fb1d-231d-4c19-84ca-8e1af0350901	USER	\N	AgACAgEAAxkBAAIB3ml0NSSJ0cUr_r1e4IH-BXo_9Xa2AAIwDGsbM62gR-nswJoft1sUAQADAgADeAADOAQ	2026-01-23 21:57:40.428152-05
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.tickets (id, user_id, status, subject, created_at, closed_at, allow_image) FROM stdin;
49782852-feca-4986-b744-cd47fbceb0c5	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	CLOSED	Soporte	2026-01-23 03:42:00.24807-05	2026-01-23 04:54:47.307876-05	t
cf9586c2-6454-48f3-9387-82c0d0348e47	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	CLOSED	Soporte	2026-01-23 04:55:18.926217-05	2026-01-23 05:02:19.480972-05	t
f0e44ccb-0223-4829-a5d8-e63095a9dfb9	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	CLOSED	Soporte	2026-01-23 05:25:32.83923-05	2026-01-23 05:32:41.260351-05	t
cf5626aa-18cb-4579-a828-37ad8c066040	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	CLOSED	Soporte	2026-01-23 06:12:43.840867-05	2026-01-23 06:29:03.52799-05	f
dc36fb1d-231d-4c19-84ca-8e1af0350901	5aeda1e8-177a-40c5-b8a5-d69c5e03514a	CLOSED	Problema con una compra	2026-01-23 21:40:34.263915-05	2026-01-23 21:58:26.593223-05	f
\.


--
-- Data for Name: user_bans; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.user_bans (id, telegram_id, reason, banned_at) FROM stdin;
4053b527-33fa-4aa8-8f10-747a85ea0787	999020	test ban	2026-01-05 17:08:13.575815-05
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: telegram
--

COPY public.users (id, telegram_id, telegram_username, referred_by_affiliate_id, referred_at, created_at, locale, telegram_photo_file_id) FROM stdin;
2f4c0dbe-190c-4f36-bf25-53605841d495	8413503771	publicidad_002	\N	2026-01-19 19:12:11.745-05	2026-01-19 19:12:11.742488-05	es	\N
8f8cbac9-75c9-4151-80a8-880fc3317aac	8547565029	publicidad_001	0252c270-fe08-467b-810a-3a3d3841d112	2026-01-16 01:12:01.408-05	2026-01-16 01:12:01.406963-05	es	AgACAgEAAxUAAWlvrQABEzd_vvOTvar2iobrMEyD1AACugtrG1EGeUeQhSjtyStYqwEAAwIAA2MAAzgE
039d2e58-155b-408e-91c4-7dadddc4fff7	6593650188	MuzaDepass	0252c270-fe08-467b-810a-3a3d3841d112	2026-01-23 19:11:52.432795-05	2026-01-23 19:07:44.089375-05	es	AgACAgEAAxUAAWl0DU9NwKYRSM-7XOkkll9o3ay5AAKKrjEb652pRBubnHvBS1ijAQADAgADYwADOAQ
cd8e170f-f4e1-4a06-926f-d6de78b8894a	7949394998	publicidad_003	0252c270-fe08-467b-810a-3a3d3841d112	2026-01-06 00:04:12.494-05	2026-01-06 00:04:12.466086-05	es	AgACAgEAAxUAAWlvqR4k_zRxjP5v5jep_zroyiayAAJsC2sbuZhZR6lohRqvfS0sAQADAgADYwADOAQ
5aeda1e8-177a-40c5-b8a5-d69c5e03514a	7621162350	NoroPayments	\N	\N	2026-01-05 15:41:56.627044-05	es	AgACAgEAAxUAAWlvpcQlr760VvetRufaH4Da39oXAAIDC2sbh535Rutf-t_cojnKAQADAgADYwADOAQ
21695be9-dc14-430b-87b4-b3b8f7d4f9e2	8535221948	noroventas_bot	\N	\N	2026-01-20 03:56:19.369444-05	es	\N
8a021ee6-64d4-4352-bee9-abf936938105	222	u222b	\N	\N	2026-01-05 15:44:12.831562-05	es	\N
073873b1-3eef-4d68-a26c-2390da7712ed	111	u111	\N	\N	2026-01-05 15:43:52.040204-05	es	\N
8ad8b562-a0af-4745-a439-a2643a24c096	999001	nuevo999001	\N	\N	2026-01-05 16:55:04.120122-05	es	\N
ad2ce86b-384c-4fe6-9511-71ea0690ca84	999002	u999002b	\N	\N	2026-01-05 16:56:36.835239-05	es	\N
ae739f1a-e4d7-4e05-9e5f-09c023101976	900000000000	admin_affiliate	\N	\N	2026-01-05 17:00:29.106737-05	es	\N
c9a80ddd-08d1-4098-b128-0c6fce51f117	999010	u999010	0252c270-fe08-467b-810a-3a3d3841d112	2026-01-05 17:04:34.215-05	2026-01-05 17:04:34.210038-05	es	\N
fdf31a65-ba1e-49c4-9560-55629d657ab8	999011	u999011b	0252c270-fe08-467b-810a-3a3d3841d112	2026-01-05 17:04:59.551-05	2026-01-05 17:04:59.544759-05	es	\N
3ce3e046-7f3b-410a-85a2-0d398d8080cb	999012	banned	0252c270-fe08-467b-810a-3a3d3841d112	2026-01-05 17:06:15.71-05	2026-01-05 17:06:15.704057-05	es	\N
\.


--
-- Name: orders_order_number_seq; Type: SEQUENCE SET; Schema: public; Owner: muza
--

SELECT pg_catalog.setval('public.orders_order_number_seq', 4, true);


--
-- Name: products_sku_key_seq; Type: SEQUENCE SET; Schema: public; Owner: muza
--

SELECT pg_catalog.setval('public.products_sku_key_seq', 40, true);


--
-- Name: affiliate_adjustments affiliate_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.affiliate_adjustments
    ADD CONSTRAINT affiliate_adjustments_pkey PRIMARY KEY (id);


--
-- Name: affiliate_invoices affiliate_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.affiliate_invoices
    ADD CONSTRAINT affiliate_invoices_pkey PRIMARY KEY (id);


--
-- Name: affiliates affiliates_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_pkey PRIMARY KEY (id);


--
-- Name: affiliates affiliates_user_id_key; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_user_id_key UNIQUE (user_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_order_id_key; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_order_id_key UNIQUE (order_id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_payments order_payments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_order_id_key UNIQUE (order_id);


--
-- Name: order_payments order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_pkey PRIMARY KEY (id);


--
-- Name: order_refunds order_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payout_adjustments payout_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.payout_adjustments
    ADD CONSTRAINT payout_adjustments_pkey PRIMARY KEY (payout_id, adjustment_id);


--
-- Name: payout_items payout_items_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.payout_items
    ADD CONSTRAINT payout_items_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: product_stock_holds product_stock_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.product_stock_holds
    ADD CONSTRAINT product_stock_holds_pkey PRIMARY KEY (id);


--
-- Name: product_stock_units product_stock_units_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.product_stock_units
    ADD CONSTRAINT product_stock_units_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: support_bans support_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.support_bans
    ADD CONSTRAINT support_bans_pkey PRIMARY KEY (id);


--
-- Name: support_bans support_bans_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.support_bans
    ADD CONSTRAINT support_bans_telegram_id_key UNIQUE (telegram_id);


--
-- Name: ticket_messages ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: user_bans user_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.user_bans
    ADD CONSTRAINT user_bans_pkey PRIMARY KEY (id);


--
-- Name: user_bans user_bans_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.user_bans
    ADD CONSTRAINT user_bans_telegram_id_key UNIQUE (telegram_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);


--
-- Name: cart_items_unique_product_per_cart; Type: INDEX; Schema: public; Owner: telegram
--

CREATE UNIQUE INDEX cart_items_unique_product_per_cart ON public.cart_items USING btree (cart_id, product_id);


--
-- Name: carts_one_active_per_user; Type: INDEX; Schema: public; Owner: telegram
--

CREATE UNIQUE INDEX carts_one_active_per_user ON public.carts USING btree (telegram_id) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_affiliate_adjustments_affiliate; Type: INDEX; Schema: public; Owner: muza
--

CREATE INDEX idx_affiliate_adjustments_affiliate ON public.affiliate_adjustments USING btree (affiliate_id, status, created_at DESC);


--
-- Name: idx_affiliate_invoices_affiliate; Type: INDEX; Schema: public; Owner: muza
--

CREATE INDEX idx_affiliate_invoices_affiliate ON public.affiliate_invoices USING btree (affiliate_id, status, created_at DESC);


--
-- Name: idx_affiliate_invoices_expiry; Type: INDEX; Schema: public; Owner: muza
--

CREATE INDEX idx_affiliate_invoices_expiry ON public.affiliate_invoices USING btree (affiliate_id, status, expires_at DESC);


--
-- Name: idx_broadcasts_status_created; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_broadcasts_status_created ON public.broadcasts USING btree (status, created_at DESC);


--
-- Name: idx_commissions_affiliate_status; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_commissions_affiliate_status ON public.commissions USING btree (affiliate_id, status);


--
-- Name: idx_order_refunds_order_id; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_order_refunds_order_id ON public.order_refunds USING btree (order_id);


--
-- Name: idx_orders_affiliate_created; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_orders_affiliate_created ON public.orders USING btree (affiliate_id, created_at DESC);


--
-- Name: idx_orders_status_created; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_orders_status_created ON public.orders USING btree (status, created_at DESC);


--
-- Name: idx_orders_user_created; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_orders_user_created ON public.orders USING btree (user_id, created_at DESC);


--
-- Name: idx_payout_adjustments_payout; Type: INDEX; Schema: public; Owner: muza
--

CREATE INDEX idx_payout_adjustments_payout ON public.payout_adjustments USING btree (payout_id);


--
-- Name: idx_psh_expires_at; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_psh_expires_at ON public.product_stock_holds USING btree (expires_at);


--
-- Name: idx_psh_held_only; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_psh_held_only ON public.product_stock_holds USING btree (product_id) WHERE (status = 'HELD'::text);


--
-- Name: idx_psh_product_status; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_psh_product_status ON public.product_stock_holds USING btree (product_id, status);


--
-- Name: idx_psu_available_only; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_psu_available_only ON public.product_stock_units USING btree (product_id) WHERE (status = 'AVAILABLE'::public.stock_unit_status_enum);


--
-- Name: idx_psu_held_by_order; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_psu_held_by_order ON public.product_stock_units USING btree (held_by_order_id);


--
-- Name: idx_psu_product_status; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_psu_product_status ON public.product_stock_units USING btree (product_id, status);


--
-- Name: idx_ticket_messages_ticket_created; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_ticket_messages_ticket_created ON public.ticket_messages USING btree (ticket_id, created_at);


--
-- Name: idx_tickets_user_status; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_tickets_user_status ON public.tickets USING btree (user_id, status);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by_affiliate_id);


--
-- Name: orders_order_number_unique; Type: INDEX; Schema: public; Owner: telegram
--

CREATE UNIQUE INDEX orders_order_number_unique ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL);


--
-- Name: payout_items_commission_idx; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX payout_items_commission_idx ON public.payout_items USING btree (commission_id);


--
-- Name: payout_items_payout_id_idx; Type: INDEX; Schema: public; Owner: telegram
--

CREATE INDEX payout_items_payout_id_idx ON public.payout_items USING btree (payout_id);


--
-- Name: products_code_unique; Type: INDEX; Schema: public; Owner: telegram
--

CREATE UNIQUE INDEX products_code_unique ON public.products USING btree (code) WHERE (code IS NOT NULL);


--
-- Name: products_sku_key_unique; Type: INDEX; Schema: public; Owner: telegram
--

CREATE UNIQUE INDEX products_sku_key_unique ON public.products USING btree (sku_key) WHERE (sku_key IS NOT NULL);


--
-- Name: affiliate_adjustments affiliate_adjustments_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.affiliate_adjustments
    ADD CONSTRAINT affiliate_adjustments_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE CASCADE;


--
-- Name: affiliate_invoices affiliate_invoices_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.affiliate_invoices
    ADD CONSTRAINT affiliate_invoices_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE CASCADE;


--
-- Name: affiliates affiliates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: broadcasts broadcasts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: commissions commissions_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE RESTRICT;


--
-- Name: commissions commissions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: order_payments order_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_refunds order_refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE SET NULL;


--
-- Name: orders orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payout_adjustments payout_adjustments_adjustment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.payout_adjustments
    ADD CONSTRAINT payout_adjustments_adjustment_id_fkey FOREIGN KEY (adjustment_id) REFERENCES public.affiliate_adjustments(id) ON DELETE CASCADE;


--
-- Name: payout_adjustments payout_adjustments_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: muza
--

ALTER TABLE ONLY public.payout_adjustments
    ADD CONSTRAINT payout_adjustments_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.payouts(id) ON DELETE CASCADE;


--
-- Name: payout_items payout_items_commission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.payout_items
    ADD CONSTRAINT payout_items_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES public.commissions(id) ON DELETE RESTRICT;


--
-- Name: payout_items payout_items_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.payout_items
    ADD CONSTRAINT payout_items_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.payouts(id) ON DELETE CASCADE;


--
-- Name: payouts payouts_affiliate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE RESTRICT;


--
-- Name: product_stock_holds product_stock_holds_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.product_stock_holds
    ADD CONSTRAINT product_stock_holds_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- Name: product_stock_holds product_stock_holds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.product_stock_holds
    ADD CONSTRAINT product_stock_holds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: product_stock_holds product_stock_holds_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.product_stock_holds
    ADD CONSTRAINT product_stock_holds_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_stock_units product_stock_units_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.product_stock_units
    ADD CONSTRAINT product_stock_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: ticket_messages ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: users users_referred_by_affiliate_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: telegram
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_affiliate_id_fk FOREIGN KEY (referred_by_affiliate_id) REFERENCES public.affiliates(id) ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO telegram;
GRANT USAGE ON SCHEMA public TO muza;


--
-- Name: TABLE affiliate_adjustments; Type: ACL; Schema: public; Owner: muza
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.affiliate_adjustments TO telegram;


--
-- Name: TABLE affiliate_invoices; Type: ACL; Schema: public; Owner: muza
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.affiliate_invoices TO telegram;


--
-- Name: SEQUENCE orders_order_number_seq; Type: ACL; Schema: public; Owner: muza
--

GRANT SELECT,USAGE ON SEQUENCE public.orders_order_number_seq TO PUBLIC;
GRANT ALL ON SEQUENCE public.orders_order_number_seq TO telegram;


--
-- Name: TABLE payout_adjustments; Type: ACL; Schema: public; Owner: muza
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payout_adjustments TO telegram;


--
-- Name: TABLE product_stock_holds; Type: ACL; Schema: public; Owner: telegram
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_stock_holds TO PUBLIC;


--
-- Name: TABLE product_stock_units; Type: ACL; Schema: public; Owner: telegram
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_stock_units TO PUBLIC;


--
-- Name: SEQUENCE products_sku_key_seq; Type: ACL; Schema: public; Owner: muza
--

GRANT SELECT,USAGE ON SEQUENCE public.products_sku_key_seq TO telegram;


--
-- Name: TABLE support_bans; Type: ACL; Schema: public; Owner: muza
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.support_bans TO telegram;


--
-- PostgreSQL database dump complete
--

\unrestrict r2XnkG1AIio0jHt1Adc0M3iy2jkV6L5XvA018COVcVLuuHzsUHCcHxUjuByEeyl

