-- Hotel Deposit Database Schema
-- PostgreSQL Relational Database for Hotel Deposit Policies
-- Run this script to initialize the database

-- Enable UUID extension for slugs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BRANDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    brand_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- HOTELS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS hotels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    address VARCHAR(500),
    city VARCHAR(255) NOT NULL,
    state VARCHAR(100),
    zip VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    phone VARCHAR(50),
    slug VARCHAR(500) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast slug lookups
CREATE INDEX idx_hotels_slug ON hotels(slug);
CREATE INDEX idx_hotels_city ON hotels(city);
CREATE INDEX idx_hotels_brand ON hotels(brand_id);

-- ============================================
-- POLICIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS policies (
    id SERIAL PRIMARY KEY,
    hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE,
    deposit_amount DECIMAL(10, 2),
    is_percentage BOOLEAN DEFAULT FALSE,
    hold_duration_days INTEGER,
    refund_terms TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for policy lookups
CREATE INDEX idx_policies_hotel ON policies(hotel_id);
CREATE INDEX idx_policies_last_updated ON policies(last_updated);

-- ============================================
-- ADMIN USERS TABLE (for authentication)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================
INSERT INTO brands (brand_name) VALUES 
    ('Wyndham'),
    ('Marriott'),
    ('Hilton'),
    ('IHG'),
    ('Choice Hotels'),
    ('Best Western'),
    ('Radisson'),
    ('Independent')
ON CONFLICT (brand_name) DO NOTHING;

-- Sample hotels
INSERT INTO hotels (name, brand_id, address, city, state, zip, country, phone, slug) VALUES
    ('Ramada by Wyndham Spokane Valley', 1, '508 E 2nd Ave', 'Spokane Valley', 'WA', '99212', 'USA', '(509) 922-4200', 'ramada-spokane-valley'),
    ('Wyndham Garden Boise Airport', 1, '1818 S Airport Way', 'Boise', 'ID', '83705', 'USA', '(208) 336-7000', 'wyndham-garden-boise-airport'),
    ('Marriott Boise Downtown', 2, '3300 S Vista Ave', 'Boise', 'ID', '83705', 'USA', '(208) 344-0000', 'marriott-boise-downtown'),
    ('Hilton Garden Inn Great Falls', 3, '2525 10th Ave S', 'Great Falls', 'MT', '59405', 'USA', '(406) 452-9500', 'hilton-garden-inn-great-falls')
ON CONFLICT (slug) DO NOTHING;

-- Sample policies
INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms) VALUES
    (1, 150.00, FALSE, 1, 'Full refund if cancelled 24 hours before check-in. No refund for early checkout.'),
    (2, 25.00, TRUE, 1, 'Deposit is non-refundable. Applied as a processing fee.'),
    (3, 50.00, FALSE, 1, 'Fully refundable if cancelled by 6 PM on day of arrival.'),
    (4, 25.00, TRUE, 1, 'One night deposit required. Refundable if cancelled 48 hours prior.')
ON CONFLICT DO NOTHING;

-- ============================================
-- FUNCTION TO GENERATE SLUG
-- ============================================
CREATE OR REPLACE FUNCTION generate_slug(text)
RETURNS TEXT AS $$
DECLARE
    input_text TEXT;
    slug_text TEXT;
BEGIN
    input_text := LOWER($1);
    slug_text := regexp_replace(input_text, '[^a-z0-9\s-]', '', 'g');
    slug_text := regexp_replace(slug_text, '\s+', '-', 'g');
    slug_text := regexp_replace(slug_text, '-+', '-', 'g');
    RETURN slug_text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- VIEW FOR COMBINED HOTEL + POLICY DATA
-- ============================================
CREATE OR REPLACE VIEW hotel_policies_view AS
SELECT 
    h.id,
    h.name AS hotel_name,
    h.city,
    h.state,
    h.country,
    h.address,
    h.phone,
    h.slug,
    b.brand_name,
    p.deposit_amount,
    p.is_percentage,
    p.hold_duration_days,
    p.refund_terms,
    p.last_updated
FROM hotels h
LEFT JOIN brands b ON h.brand_id = b.id
LEFT JOIN policies p ON h.id = p.hotel_id;

-- ============================================
-- TRIGGER TO UPDATE TIMESTAMP
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hotels_updated_at
    BEFORE UPDATE ON hotels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
