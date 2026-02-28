const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hoteldeposit',
    waitForConnections: true,
    connectionLimit: 10
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const generateSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

const formatDeposit = (amount, isPercentage) => {
    if (isPercentage) {
        return `${amount}%`;
    }
    return `$${parseFloat(amount).toFixed(2)}`;
};

app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const searchQuery = `
            SELECT 
                h.id,
                h.name AS hotel_name,
                h.city,
                h.state,
                h.slug,
                b.brand_name,
                p.deposit_amount,
                p.is_percentage,
                p.hold_duration_days,
                p.refund_terms,
                p.last_updated
            FROM hotels h
            LEFT JOIN brands b ON h.brand_id = b.id
            LEFT JOIN policies p ON h.id = p.hotel_id
            WHERE LOWER(h.name) LIKE LOWER(?) OR LOWER(h.city) LIKE LOWER(?)
            ORDER BY 
                CASE 
                    WHEN LOWER(h.name) LIKE LOWER(?) THEN 1
                    WHEN LOWER(h.city) LIKE LOWER(?) THEN 2
                    ELSE 3
                END
            LIMIT 20
        `;

        const searchPattern = `%${q}%`;
        const searchPatternExact = `${q}%`;
        
        const result = await pool.query(searchQuery, [searchPattern, searchPatternExact]);
        
        const hotels = result[0].map(hotel => ({
            ...hotel,
            deposit_display: formatDeposit(hotel.deposit_amount, hotel.is_percentage)
        }));

        res.json(hotels);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/hotels', async (req, res) => {
    try {
        const { city, brand, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                h.id,
                h.name AS hotel_name,
                h.city,
                h.state,
                h.slug,
                b.brand_name,
                p.deposit_amount,
                p.is_percentage,
                p.hold_duration_days,
                p.last_updated
            FROM hotels h
            LEFT JOIN brands b ON h.brand_id = b.id
            LEFT JOIN policies p ON h.id = p.hotel_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (city) {
            query += ` AND LOWER(h.city) LIKE LOWER($${paramIndex})`;
            params.push(`%${city}%`);
            paramIndex++;
        }

        if (brand) {
            query += ` AND LOWER(b.brand_name) LIKE LOWER($${paramIndex})`;
            params.push(`%${brand}%`);
            paramIndex++;
        }

        query += ` ORDER BY h.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        
        const countQuery = `
            SELECT COUNT(*) FROM hotels h
            LEFT JOIN brands b ON h.brand_id = b.id
            WHERE 1=1
            ${city ? `AND LOWER(h.city) LIKE LOWER('%${city}%')` : ''}
            ${brand ? `AND LOWER(b.brand_name) LIKE LOWER('%${brand}%')` : ''}
        `;
        const countResult = await pool.query(countQuery);
        
        res.json({
            hotels: result[0],
            total: parseInt(countResult[0][0].count),
            page: parseInt(page),
            totalPages: Math.ceil(countResult[0][0].count / limit)
        });
    } catch (error) {
        console.error('Hotels error:', error);
        res.status(500).json({ error: 'Failed to fetch hotels' });
    }
});

app.get('/api/hotel/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const query = `
            SELECT 
                h.id,
                h.name AS hotel_name,
                h.address,
                h.city,
                h.state,
                h.zip,
                h.country,
                h.phone,
                h.slug,
                b.brand_name,
                b.id AS brand_id,
                p.id AS policy_id,
                p.deposit_amount,
                p.is_percentage,
                p.hold_duration_days,
                p.refund_terms,
                p.last_updated
            FROM hotels h
            LEFT JOIN brands b ON h.brand_id = b.id
            LEFT JOIN policies p ON h.id = p.hotel_id
            WHERE h.slug = ?
        `;

        const result = await pool.query(query, [slug]);

        if (result[0].length === 0) {
            return res.status(404).json({ error: 'Hotel not found' });
        }

        const hotel = result[0][0];
        hotel.deposit_display = formatDeposit(hotel.deposit_amount, hotel.is_percentage);

        res.json(hotel);
    } catch (error) {
        console.error('Hotel error:', error);
        res.status(500).json({ error: 'Failed to fetch hotel' });
    }
});

app.get('/api/brands', async (req, res) => {
    try {
        const query = `
            SELECT 
                b.id,
                b.brand_name,
                COUNT(h.id) AS hotel_count
            FROM brands b
            LEFT JOIN hotels h ON b.id = h.brand_id
            GROUP BY b.id
            ORDER BY b.brand_name
        `;

        const result = await pool.query(query);
        res.json(result[0]);
    } catch (error) {
        console.error('Brands error:', error);
        res.status(500).json({ error: 'Failed to fetch brands' });
    }
});

app.get('/api/brands/:brandName/hotels', async (req, res) => {
    try {
        const { brandName } = req.params;

        const query = `
            SELECT 
                h.id,
                h.name AS hotel_name,
                h.city,
                h.state,
                h.slug,
                p.deposit_amount,
                p.is_percentage,
                p.hold_duration_days
            FROM hotels h
            LEFT JOIN policies p ON h.id = p.hotel_id
            WHERE h.brand_id = (
                SELECT id FROM brands WHERE LOWER(brand_name) LIKE LOWER(?) LIMIT 1
            )
            ORDER BY h.city, h.name
        `;

        const result = await pool.query(query, [brandName]);
        res.json(result[0]);
    } catch (error) {
        console.error('Brand hotels error:', error);
        res.status(500).json({ error: 'Failed to fetch brand hotels' });
    }
});

app.get('/api/cities', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT city, state, COUNT(*) AS hotel_count
            FROM hotels
            GROUP BY city, state
            ORDER BY hotel_count DESC, city
            LIMIT 50
        `;

        const result = await pool.query(query);
        res.json(result[0]);
    } catch (error) {
        console.error('Cities error:', error);
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
});

app.post('/api/admin/import', async (req, res) => {
    try {
        const { hotels, brands: brandData } = req.body;

        const client = await pool.getConnection();
        
        try {
            await client.beginTransaction();

            if (brandData && brandData.length > 0) {
                for (const brand of brandData) {
                    await client.query(
                        `INSERT INTO brands (brand_name) VALUES (?) ON DUPLICATE KEY UPDATE brand_name = VALUES(brand_name)`,
                        [brand]
                    );
                }
            }

            if (hotels && hotels.length > 0) {
                for (const hotel of hotels) {
                    let brandId = null;
                    if (hotel.brand_name) {
                        const brandResult = await client.query(
                            `SELECT id FROM brands WHERE brand_name = ?`,
                            [hotel.brand_name]
                        );
                        if (brandResult[0].length > 0) {
                            brandId = brandResult[0][0].id;
                        }
                    }

                    const slug = hotel.slug || generateSlug(hotel.name + '-' + hotel.city);
                    
                    await client.query(
                        `INSERT INTO hotels (name, brand_id, address, city, state, zip, country, phone, slug)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                            name = VALUES(name),
                            brand_id = COALESCE(VALUES(brand_id), brand_id),
                            address = COALESCE(VALUES(address), address),
                            city = VALUES(city),
                            state = VALUES(state),
                            zip = COALESCE(VALUES(zip), zip),
                            phone = COALESCE(VALUES(phone), phone)`,
                        [
                            hotel.name,
                            brandId,
                            hotel.address,
                            hotel.city,
                            hotel.state,
                            hotel.zip,
                            hotel.country || 'USA',
                            hotel.phone,
                            slug
                        ]
                    );

                    const hotelResult = await client.query(
                        `SELECT id FROM hotels WHERE slug = ?`,
                        [slug]
                    );

                    if (hotelResult[0].length > 0 && hotel.policy) {
                        const policy = hotel.policy;
                        await client.query(
                            `INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms)
                             VALUES (?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                                deposit_amount = VALUES(deposit_amount),
                                is_percentage = VALUES(is_percentage),
                                hold_duration_days = VALUES(hold_duration_days),
                                refund_terms = VALUES(refund_terms),
                                last_updated = NOW()`,
                            [
                                hotelResult[0][0].id,
                                policy.deposit_amount,
                                policy.is_percentage || false,
                                policy.hold_duration_days,
                                policy.refund_terms
                            ]
                        );
                    }
                }
            }

            await client.commit();
            res.json({ success: true, message: 'Import completed successfully' });
        } catch (e) {
            await client.rollback();
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Import failed' });
    }
});

app.post('/api/admin/hotel', async (req, res) => {
    try {
        const { name, brand_id, address, city, state, zip, country, phone, policy } = req.body;

        const slug = generateSlug(name + '-' + city);

        const client = await pool.getConnection();
        
        try {
            await client.beginTransaction();

            const hotelResult = await client.query(
                `INSERT INTO hotels (name, brand_id, address, city, state, zip, country, phone, slug)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id`,
                [name, brand_id, address, city, state, zip, country || 'USA', phone, slug]
            );

            const hotelId = hotelResult[0][0].id;

            if (policy) {
                await client.query(
                    `INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        hotelId,
                        policy.deposit_amount,
                        policy.is_percentage || false,
                        policy.hold_duration_days,
                        policy.refund_terms
                    ]
                );
            }

            await client.commit();
            res.json({ success: true, slug });
        } catch (e) {
            await client.rollback();
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Create hotel error:', error);
        res.status(500).json({ error: 'Failed to create hotel' });
    }
});

app.get('/api/policies', async (req, res) => {
    try {
        const query = `SELECT * FROM policies ORDER BY id`;
        const result = await pool.query(query);
        res.json(result[0]);
    } catch (error) {
        console.error('Policies error:', error);
        res.status(500).json({ error: 'Failed to fetch policies' });
    }
});

app.get('/api/admin/analytics', async (req, res) => {
    try {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM hotels) AS total_hotels,
                (SELECT COUNT(*) FROM policies) AS total_policies,
                (SELECT COUNT(*) FROM brands) AS total_brands,
                (SELECT AVG(deposit_amount) FROM policies WHERE is_percentage = FALSE) AS avg_deposit
        `;
        const result = await pool.query(query);
        const row = result[0][0];
        res.json({
            total_hotels: parseInt(row.total_hotels),
            total_policies: parseInt(row.total_policies),
            total_brands: parseInt(row.total_brands),
            avg_deposit: row.avg_deposit ? '$' + parseFloat(row.avg_deposit).toFixed(2) : '$0'
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.json({ total_hotels: 0, total_policies: 0, total_brands: 0, avg_deposit: '$0' });
    }
});

app.put('/api/admin/hotel/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, brand_id, address, city, state, zip, country, phone, policy } = req.body;

        const slug = generateSlug(name + '-' + city);

        const client = await pool.getConnection();
        try {
            await client.beginTransaction();

            await client.query(
                `UPDATE hotels SET name=?, brand_id=?, address=?, city=?, state=?, zip=?, country=?, phone=?, slug=?, updated_at=NOW() WHERE id=?`,
                [name, brand_id, address, city, state, zip, country || 'USA', phone, slug, id]
            );

            if (policy) {
                await client.query(
                    `INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        deposit_amount = VALUES(deposit_amount),
                        is_percentage = VALUES(is_percentage),
                        hold_duration_days = VALUES(hold_duration_days),
                        refund_terms = VALUES(refund_terms),
                        last_updated = NOW()`,
                    [id, policy.deposit_amount, policy.is_percentage || false, policy.hold_duration_days, policy.refund_terms]
                );
            }

            await client.commit();
            res.json({ success: true });
        } catch (e) {
            await client.rollback();
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Update hotel error:', error);
        res.status(500).json({ error: 'Failed to update hotel' });
    }
});

app.delete('/api/admin/hotel/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM hotels WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete hotel error:', error);
        res.status(500).json({ error: 'Failed to delete hotel' });
    }
});

app.put('/api/admin/policy/:hotelId', async (req, res) => {
    try {
        const { hotelId } = req.params;
        const { deposit_amount, is_percentage, hold_duration_days, refund_terms } = req.body;

        await pool.query(
            `INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                deposit_amount = VALUES(deposit_amount),
                is_percentage = VALUES(is_percentage),
                hold_duration_days = VALUES(hold_duration_days),
                refund_terms = VALUES(refund_terms),
                last_updated = NOW()`,
            [hotelId, deposit_amount, is_percentage, hold_duration_days, refund_terms]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Update policy error:', error);
        res.status(500).json({ error: 'Failed to update policy' });
    }
});

app.post('/api/admin/brand', async (req, res) => {
    try {
        const { brand_name } = req.body;
        await pool.query('INSERT INTO brands (brand_name) VALUES (?) ON DUPLICATE KEY UPDATE brand_name = VALUES(brand_name)', [brand_name]);
        res.json({ success: true });
    } catch (error) {
        console.error('Create brand error:', error);
        res.status(500).json({ error: 'Failed to create brand' });
    }
});

app.delete('/api/admin/brand/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM brands WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete brand error:', error);
        res.status(500).json({ error: 'Failed to delete brand' });
    }
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/hotel/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'hotel.html'));
});

app.get('/submit', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
    console.log(`Hotel Deposit API running on port ${PORT}`);
});

module.exports = app;
