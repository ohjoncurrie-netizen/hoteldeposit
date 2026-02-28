const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/hoteldeposit',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const generateSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

const importJSON = async (filePath) => {
    const connection = await pool.getConnection();
    
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const { brands, hotels } = data;

        await connection.beginTransaction();

        if (brands && brands.length > 0) {
            for (const brand of brands) {
                await connection.query(
                    `INSERT INTO brands (brand_name) VALUES (?) ON DUPLICATE KEY UPDATE brand_name = VALUES(brand_name)`,
                    [brand]
                );
            }
            console.log(`Imported ${brands.length} brands`);
        }

        if (hotels && hotels.length > 0) {
            for (const hotel of hotels) {
                let brandId = null;
                if (hotel.brand) {
                    const [brandResult] = await connection.query(
                        `SELECT id FROM brands WHERE brand_name = ?`,
                        [hotel.brand]
                    );
                    if (brandResult.length > 0) {
                        brandId = brandResult[0].id;
                    }
                }

                const slug = hotel.slug || generateSlug(`${hotel.name}-${hotel.city}`);
                
                await connection.query(
                    `INSERT INTO hotels (name, brand_id, address, city, state, zip, country, phone, slug)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        brand_id = COALESCE(VALUES(brand_id), brand_id)`,
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

                const [hotelResult] = await connection.query(
                    `SELECT id FROM hotels WHERE slug = ?`,
                    [slug]
                );

                const hotelId = hotelResult[0].id;

                if (hotel.deposit_amount) {
                    await connection.query(
                        `INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                            deposit_amount = VALUES(deposit_amount),
                            is_percentage = VALUES(is_percentage),
                            hold_duration_days = VALUES(hold_duration_days),
                            refund_terms = VALUES(refund_terms),
                            last_updated = NOW()`,
                        [
                            hotelId,
                            hotel.deposit_amount,
                            hotel.is_percentage || false,
                            hotel.hold_duration_days,
                            hotel.refund_terms
                        ]
                    );
                }
            }
            console.log(`Imported ${hotels.length} hotels`);
        }

        await connection.commit();
        console.log('Import completed successfully!');
    } catch (error) {
        await connection.rollback();
        console.error('Import failed:', error);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
};

const importCSV = async (filePath) => {
    const connection = await pool.getConnection();
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    try {
        await connection.beginTransaction();
        
        let imported = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const hotel = {};
            
            headers.forEach((header, index) => {
                hotel[header] = values[index]?.trim() || null;
            });

            let brandId = null;
            if (hotel.brand) {
                const [brandResult] = await connection.query(
                    `SELECT id FROM brands WHERE brand_name = ?`,
                    [hotel.brand]
                );
                if (brandResult.length > 0) {
                    brandId = brandResult[0].id;
                }
            }

            const slug = hotel.slug || generateSlug(`${hotel.name}-${hotel.city}`);
            
            try {
                await connection.query(
                    `INSERT INTO hotels (name, brand_id, address, city, state, zip, country, phone, slug)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
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

                const [hotelResult] = await connection.query(
                    `SELECT id FROM hotels WHERE slug = ?`,
                    [slug]
                );

                if (hotelResult.length > 0) {
                    const hotelId = hotelResult[0].id;

                    if (hotel.deposit_amount) {
                        await connection.query(
                            `INSERT INTO policies (hotel_id, deposit_amount, is_percentage, hold_duration_days, refund_terms)
                             VALUES (?, ?, ?, ?, ?)`,
                            [
                                hotelId,
                                parseFloat(hotel.deposit_amount),
                                (hotel.is_percentage === 'true' || hotel.is_percentage === '1'),
                                parseInt(hotel.hold_duration_days) || 1,
                                hotel.refund_terms
                            ]
                        );
                    }
                    imported++;
                }
            } catch (e) {
                console.log(`Skipped: ${hotel.name} - ${e.message}`);
            }
        }

        await connection.commit();
        console.log(`Imported ${imported} hotels from CSV`);
    } catch (error) {
        await connection.rollback();
        console.error('CSV Import failed:', error);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
};

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node import.js <file.json|file.csv>');
    console.log('Example: node import.js data/hotels.json');
    process.exit(1);
}

const filePath = path.resolve(args[0]);
const ext = path.extname(filePath).toLowerCase();

if (ext === '.json') {
    importJSON(filePath);
} else if (ext === '.csv') {
    importCSV(filePath);
} else {
    console.error('Unsupported file format. Use .json or .csv');
    process.exit(1);
}
