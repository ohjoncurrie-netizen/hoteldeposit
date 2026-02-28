function filterByDepositAmount(hotels, min, max) {
    if (min === undefined && max === undefined) {
        return hotels;
    }
    
    return hotels.filter(hotel => {
        const amount = parseFloat(hotel.deposit_amount);
        if (isNaN(amount)) return false;
        
        if (hotel.is_percentage) {
            return false;
        }
        
        const meetsMin = min !== undefined ? amount >= min : true;
        const meetsMax = max !== undefined ? amount <= max : true;
        
        return meetsMin && meetsMax;
    });
}

function filterByDepositPercentage(hotels, min, max) {
    if (min === undefined && max === undefined) {
        return hotels;
    }
    
    return hotels.filter(hotel => {
        if (!hotel.is_percentage) return false;
        
        const amount = parseFloat(hotel.deposit_amount);
        if (isNaN(amount)) return false;
        
        const meetsMin = min !== undefined ? amount >= min : true;
        const meetsMax = max !== undefined ? amount <= max : true;
        
        return meetsMin && meetsMax;
    });
}

function getTopBrandsByHotelCount(brands, limit = 10) {
    return [...brands]
        .sort((a, b) => (b.hotel_count || 0) - (a.hotel_count || 0))
        .slice(0, limit);
}

function calculateAverageDeposit(hotels) {
    const validHotels = hotels.filter(h => 
        h.deposit_amount && !h.is_percentage
    );
    
    if (validHotels.length === 0) return 0;
    
    const sum = validHotels.reduce((acc, h) => acc + parseFloat(h.deposit_amount), 0);
    return sum / validHotels.length;
}

function sortByDepositAmount(hotels, ascending = true) {
    return [...hotels].sort((a, b) => {
        const aAmount = parseFloat(a.deposit_amount) || 0;
        const bAmount = parseFloat(b.deposit_amount) || 0;
        return ascending ? aAmount - bAmount : bAmount - aAmount;
    });
}

function getDepositStats(hotels) {
    const fixed = hotels.filter(h => !h.is_percentage && h.deposit_amount);
    const percentage = hotels.filter(h => h.is_percentage && h.deposit_amount);
    const amounts = fixed.map(h => parseFloat(h.deposit_amount)).filter(a => !isNaN(a));
    
    return {
        total: hotels.length,
        fixedCount: fixed.length,
        percentageCount: percentage.length,
        min: amounts.length ? Math.min(...amounts) : 0,
        max: amounts.length ? Math.max(...amounts) : 0,
        avg: amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0
    };
}
