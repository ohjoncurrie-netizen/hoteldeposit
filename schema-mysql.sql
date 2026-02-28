-- Hotel Deposit Database Schema for MariaDB/MySQL

CREATE DATABASE IF NOT EXISTS hoteldeposit;
USE hoteldeposit;

CREATE TABLE IF NOT EXISTS brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hotels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand_id INT,
    address VARCHAR(500),
    city VARCHAR(255) NOT NULL,
    state VARCHAR(100),
    zip VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    phone VARCHAR(50),
    slug VARCHAR(500) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

CREATE INDEX idx_hotels_slug ON hotels(slug);
CREATE INDEX idx_hotels_city ON hotels(city);
CREATE INDEX idx_hotels_brand ON hotels(brand_id);

CREATE TABLE IF NOT EXISTS policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT,
    deposit_amount DECIMAL(10, 2),
    is_percentage BOOLEAN DEFAULT FALSE,
    hold_duration_days INT,
    refund_terms TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    UNIQUE (hotel_id)
);

CREATE INDEX idx_policies_hotel ON policies(hotel_id);
CREATE INDEX idx_policies_last_updated ON policies(last_updated);

INSERT INTO brands (brand_name) VALUES 
    ('Wyndham'),
    ('Marriott'),
    ('Hilton'),
    ('IHG'),
    ('Choice Hotels'),
    ('Best Western'),
    ('Radisson'),
    ('Independent')
ON DUPLICATE KEY UPDATE brand_name = VALUES(brand_name);

INSERT INTO hotels (name, brand_id, address, city, state, zip, country, phone, slug) VALUES
    ('Ramada by Wyndham Spokane Valley', 1, '508 E 2nd Ave', 'Spokane Valley', 'WA', '99212', 'USA', '(509) 922-4200', 'ramada-spokane-valley'),
    ('Wyndham Garden Boise Airport', 1, '1818 S Airport Way', 'Boise', 'ID', '83705', 'USA', '(208) 336-7000', 'wyndham-garden-boise-airport'),
    ('Marriott Boise Downtown', 2, '3300 S Vista Ave', 'Boise', 'ID', '83705', 'USA', '(208) 344-0000', 'marriott-boise-downtown'),
    ('Hilton Garden Inn Great Falls', 3, '2525 10th Ave S', 'Great Falls', 'MT', '59405', 'USA', '(406) 452-9500', 'hilton-garden-inn-great-falls')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms) VALUES
    (1, 150.00, FALSE, 1, 'Full refund if cancelled 24 hours before check-in. No refund for early checkout.'),
    (2, 25.00, TRUE, 1, 'Deposit is non-refundable. Applied as a processing fee.'),
    (3, 50.00, FALSE, 1, 'Fully refundable if cancelled by 6 PM on day of arrival.'),
    (4, 25.00, TRUE, 1, 'One night deposit required. Refundable if cancelled 48 hours prior.')
ON DUPLICATE KEY UPDATE deposit_amount = VALUES(deposit_amount);
