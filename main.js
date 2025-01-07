import { parkingLocations } from './src/data/parkingLocations.js';
import { currentUser, updateWalletBalance } from './src/data/users.js';

class ParkingMap {
    constructor() {
        this.map = null;
        this.markers = [];
        this.currentLocation = null;
        this.parkingLocations = parkingLocations;
        this.initialized = false;
        this.retryAttempts = 0;
        this.maxRetries = 2; // Reduce retry attempts
        this.retryDelay = 200; // Shorter delay between retries
        this.uiElements = null;
        this.elements = {};
    }

    async initialize() {
        try {
            await this.initMap();
            await this.cacheElements();
            await this.initFeatures();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize:', error);
            alert('Error initializing application. Please refresh the page.');
        }
    }

    async cacheElements() {
        const elementIds = {
            map: 'map',
            userName: 'userName',
            walletAmount: 'walletAmount',
            profileAvatar: 'profileAvatar',
            profileDropdown: 'profileDropdown',
            navProfile: 'navProfile',
            parkingSpots: 'parkingSpots',
            overlay: 'overlay'
        };

        return new Promise((resolve, reject) => {
            const getElements = () => {
                const elements = {};
                const missing = [];

                for (const [key, id] of Object.entries(elementIds)) {
                    const element = document.getElementById(id);
                    if (element) {
                        elements[key] = element;
                    } else {
                        missing.push(id);
                    }
                }

                if (missing.length === 0 || this.retryAttempts >= this.maxRetries) {
                    if (missing.length === 0) {
                        this.elements = elements;
                        resolve(elements);
                    } else {
                        reject(new Error(`Critical elements missing: ${missing.join(', ')}`));
                    }
                } else {
                    this.retryAttempts++;
                    setTimeout(getElements, 200);
                }
            };

            getElements();
        });
    }

    async initFeatures() {
        // Initialize features in parallel
        await Promise.all([
            this.initProfileNavigation(),
            this.initProfilePages(),
            this.initFilters()
        ]);

        // Initialize UI components
        this.renderParkingList();
        this.updateNavProfile();
        
        // Start real-time updates after a delay
        setTimeout(() => {
            this.startRealTimeUpdates();
        }, 1000);
    }

    handleInitializationError(errorMessage) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.innerHTML = `
                <div class="error-message">
                    <h3>Error Loading Application</h3>
                    <p>${errorMessage}</p>
                    <button onclick="window.location.reload()">Refresh Page</button>
                </div>
            `;
        }
    }

    async init() {
        this.initMap();
        this.initFilters();
        this.renderParkingList();
        this.startRealTimeUpdates();
    }

    initMap() {
        // Initialize map centered on Nagpur
        this.map = L.map('map').setView([21.1458, 79.0882], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.addMarkersToMap();
    }

    addMarkersToMap() {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        this.parkingLocations.forEach(location => {
            const marker = L.marker([location.coordinates.lat, location.coordinates.lng])
                .bindPopup(this.createPopupContent(location))
                .addTo(this.map);
            
            this.markers.push(marker);
        });
    }

    createPopupContent(location) {
        const occupancyPercentage = ((location.totalSpots - location.availableSpots) / location.totalSpots * 100).toFixed(1);
        const availabilityClass = this.getAvailabilityClass(location.availableSpots, location.totalSpots);
        
        const bookingForm = location.availableSpots > 0 ? `
            <form class="booking-form" onsubmit="handleBooking(event, ${location.id})">
                <div class="time-inputs">
                    <div class="input-group">
                        <input type="number" min="0" max="24" value="1" name="hours" required>
                        <label>hrs</label>
                    </div>
                    <div class="input-group">
                        <input type="number" min="0" max="59" value="0" step="15" name="minutes" required>
                        <label>min</label>
                    </div>
                </div>
                <button type="submit">Book Now (₹${location.pricePerHour}/hr)</button>
            </form>
        ` : '<p class="error">No spots available</p>';
        
        return `
            <div class="popup-content">
                <h3>${location.name}</h3>
                <p><strong>Address:</strong> ${location.address}</p>
                <p><strong>Available:</strong> <span class="${availabilityClass}">${location.availableSpots}/${location.totalSpots}</span></p>
                <p><strong>Occupancy:</strong> ${occupancyPercentage}%</p>
                <p><strong>Rate:</strong> ₹${location.pricePerHour}/hr</p>
                <p><strong>Type:</strong> ${location.type}</p>
                <p><strong>Vehicles:</strong> ${location.vehicleTypes.join(', ')}</p>
                <p><strong>Hours:</strong> ${location.operatingHours}</p>
                ${bookingForm}
            </div>
        `;
    }

    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);

        // Remove toast after animation
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    triggerConfetti() {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#2196F3', '#4CAF50', '#FFC107', '#F44336'],
            zIndex: 9999
        });

        // Second burst for more effect
        setTimeout(() => {
            confetti({
                particleCount: 50,
                spread: 100,
                origin: { y: 0.7 },
                colors: ['#2196F3', '#4CAF50', '#FFC107', '#F44336'],
                zIndex: 9999
            });
        }, 200);
    }

    handleBooking(event, locationId) {
        event.preventDefault();
        const hours = parseInt(event.target.hours.value);
        const minutes = parseInt(event.target.minutes.value);
        const totalHours = hours + (minutes / 60);
        const location = this.parkingLocations.find(p => p.id === locationId);
        const totalCost = Math.ceil(totalHours * location.pricePerHour);

        if (currentUser.walletBalance < totalCost) {
            alert('Insufficient wallet balance!');
            return;
        }

        const durationMs = (hours * 3600000) + (minutes * 60000);
        
        // Update wallet balance
        updateWalletBalance(-totalCost);

        // Update available spots
        location.availableSpots--;
        
        // Add booking to user's bookings
        currentUser.bookings.push({
            id: Date.now(),
            locationId,
            locationName: location.name,
            hours,
            minutes,
            totalHours,
            cost: totalCost,
            startTime: new Date(),
            endTime: new Date(Date.now() + durationMs)
        });

        this.showToast('Congratulations! You have successfully booked your parking slot!');
        this.triggerConfetti();
        
        this.addMarkersToMap();
        this.renderParkingList();
        this.updateNavProfile();
        alert(`Booking successful! Total cost: ₹${totalCost}`);
    }

    handleCancelBooking(bookingId) {
        if (!confirm('Are you sure you want to cancel this booking?')) return;

        const booking = currentUser.bookings.find(b => b.id === bookingId);
        if (!booking) return;

        // Check if booking is already expired
        if (new Date() >= new Date(booking.endTime)) {
            alert('Cannot cancel an expired booking');
            return;
        }

        // Calculate refund amount (50% refund if canceling)
        const refundAmount = Math.floor(booking.cost * 0.5);

        // Update wallet balance with refund
        updateWalletBalance(refundAmount);

        // Return spot to available spots
        const location = this.parkingLocations.find(p => p.id === booking.locationId);
        if (location) {
            location.availableSpots++;
        }

        // Remove booking from user's bookings
        currentUser.bookings = currentUser.bookings.filter(b => b.id !== bookingId);

        // Update UI
        this.addMarkersToMap();
        this.renderParkingList();
        this.updateNavProfile();
        if (document.getElementById('profilePage').classList.contains('active')) {
            this.showProfilePage('bookings');
        }

        alert(`Booking cancelled successfully. Refunded ₹${refundAmount}`);
    }

    initFilters() {
        document.getElementById('vehicleType').addEventListener('change', () => this.applyFilters());
        document.getElementById('parkingType').addEventListener('change', () => this.applyFilters());
        document.getElementById('priceRange').addEventListener('change', () => this.applyFilters());
        document.getElementById('getCurrentLocation').addEventListener('click', () => this.findNearestParking());
    }

    applyFilters() {
        const vehicleType = document.getElementById('vehicleType').value;
        const parkingType = document.getElementById('parkingType').value;
        const priceRange = document.getElementById('priceRange').value;

        this.parkingLocations = parkingLocations.filter(location => {
            const matchesVehicle = !vehicleType || location.vehicleTypes.includes(vehicleType);
            const matchesType = !parkingType || location.type === parkingType;
            const matchesPrice = this.matchesPriceRange(location.pricePerHour, priceRange);

            return matchesVehicle && matchesType && matchesPrice;
        });

        this.addMarkersToMap();
        this.renderParkingList();
    }

    matchesPriceRange(price, range) {
        if (!range) return true;
        
        switch(range) {
            case '0-20': return price <= 20;
            case '21-40': return price > 20 && price <= 40;
            case '41+': return price > 40;
            default: return true;
        }
    }

    findNearestParking() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    this.currentLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

                    const nearest = this.findNearestLocation(this.currentLocation);
                    this.map.setView([nearest.coordinates.lat, nearest.coordinates.lng], 15);
                    this.markers.find(marker => 
                        marker.getLatLng().lat === nearest.coordinates.lat
                    ).openPopup();
                },
                error => {
                    console.error('Error getting location:', error);
                    alert('Unable to get your location. Please try again.');
                }
            );
        } else {
            alert('Geolocation is not supported by your browser.');
        }
    }

    findNearestLocation(userLocation) {
        return this.parkingLocations.reduce((nearest, location) => {
            const distance = this.calculateDistance(
                userLocation.lat,
                userLocation.lng,
                location.coordinates.lat,
                location.coordinates.lng
            );

            if (!nearest.distance || distance < nearest.distance) {
                return { ...location, distance };
            }
            return nearest;
        }, { distance: null });
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    getAvailabilityClass(available, total) {
        const percentage = (available / total) * 100;
        if (percentage > 50) return 'available';
        if (percentage > 20) return 'limited';
        return 'full';
    }

    renderParkingList() {
        const container = document.getElementById('parkingSpots');
        container.innerHTML = '';

        this.parkingLocations.forEach(location => {
            const availabilityClass = this.getAvailabilityClass(location.availableSpots, location.totalSpots);
            const occupancyPercentage = ((location.totalSpots - location.availableSpots) / location.totalSpots * 100).toFixed(1);

            const element = document.createElement('div');
            element.className = 'parking-spot';
            element.innerHTML = `
                <h3>${location.name}</h3>
                <p class="availability ${availabilityClass}">
                    ${location.availableSpots}/${location.totalSpots} spots available
                </p>
                <p>Occupancy: ${occupancyPercentage}%</p>
                <p>Rate: ₹${location.pricePerHour}/hr</p>
                <p>Type: ${location.type}</p>
                <div class="features">
                    ${location.features.map(feature => 
                        `<span class="feature">${feature}</span>`
                    ).join('')}
                </div>
            `;

            element.addEventListener('click', () => {
                this.map.setView([location.coordinates.lat, location.coordinates.lng], 15);
                this.markers.find(marker => 
                    marker.getLatLng().lat === location.coordinates.lat
                ).openPopup();
            });

            container.appendChild(element);
        });
    }

    startRealTimeUpdates() {
        // Simulate real-time updates every 30 seconds
        setInterval(() => {
            this.parkingLocations = this.parkingLocations.map(location => ({
                ...location,
                availableSpots: Math.max(0, Math.min(
                    location.totalSpots,
                    location.availableSpots + Math.floor(Math.random() * 3) - 1
                ))
            }));

            this.addMarkersToMap();
            this.renderParkingList();
        }, 30000);
    }

    initProfileNavigation() {
        if (!this.elements.navProfile || !this.elements.profileDropdown) {
            throw new Error('Nav profile elements not found');
        }

        // Toggle dropdown on click
        this.elements.navProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.profileDropdown.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            this.elements.profileDropdown.classList.remove('active');
        });
    }

    updateNavProfile() {
        if (!this.elements) return;

        const { userName, walletAmount, profileAvatar, recentBookings } = this.elements;

        if (userName) userName.textContent = currentUser.name;
        if (walletAmount) walletAmount.textContent = currentUser.walletBalance;
        if (profileAvatar) profileAvatar.textContent = currentUser.name.charAt(0);
        
        if (recentBookings) {
            recentBookings.innerHTML = currentUser.bookings.length ? 
                currentUser.bookings.slice(0, 3).map(booking => `
                    <div class="booking-item">
                        <h4>${booking.locationName}</h4>
                        <p>Duration: ${booking.hours} hours</p>
                        <p>Valid till: ${booking.endTime.toLocaleString()}</p>
                    </div>
                `).join('') :
                '<p>No recent bookings</p>';
        }
    }

    initProfilePages() {
        // Make functions globally available
        window.showProfilePage = (page) => this.showProfilePage(page);
        window.closeProfilePage = () => this.closeProfilePage();
        window.handleLogout = () => this.handleLogout();
        window.handleAddMoney = () => this.handleAddMoney();
        window.handleCancelBooking = (bookingId) => this.handleCancelBooking(bookingId);

        // Close profile page when clicking overlay
        document.getElementById('overlay').addEventListener('click', () => {
            this.closeProfilePage();
        });
    }

    handleAddMoney() {
        const amount = parseInt(prompt('Enter amount to add (in ₹):'));
        if (amount && amount > 0) {
            updateWalletBalance(amount);
            this.updateNavProfile();
            this.renderWalletPage();
            alert(`Added ₹${amount} to wallet successfully!`);
        }
    }

    showProfilePage(page) {
        const profilePage = document.getElementById('profilePage');
        const overlay = document.getElementById('overlay');
        const content = document.getElementById('profilePageContent');
        const title = document.getElementById('profilePageTitle');

        switch(page) {
            case 'bookings':
                title.textContent = 'My Bookings';
                content.innerHTML = this.renderBookingsPage();
                break;
            case 'wallet':
                title.textContent = 'My Wallet';
                content.innerHTML = this.renderWalletPage();
                break;
            default:
                console.log('Unknown page:', page);
                return;
        }

        // Show overlay and profile page
        overlay.classList.add('active');
        profilePage.classList.add('active');
        document.getElementById('profileDropdown').classList.remove('active');
    }

    renderBookingsPage() {
        return `
            <div class="booking-history">
                ${currentUser.bookings.map(booking => `
                    <div class="booking-card">
                        <h3>${booking.locationName}</h3>
                        <p><strong>Duration:</strong> ${booking.hours}h ${booking.minutes}m</p>
                        <p><strong>Cost:</strong> ₹${booking.cost}</p>
                        <p><strong>Booked on:</strong> ${booking.startTime.toLocaleDateString()}</p>
                        <p><strong>Valid till:</strong> ${booking.endTime.toLocaleString()}</p>
                        <p class="status">${new Date() < new Date(booking.endTime) ? 
                            `<span class="active">Active</span>
                             <button class="cancel-btn" onclick="handleCancelBooking(${booking.id})">Cancel Booking</button>` : 
                            '<span class="expired">Expired</span>'}
                        </p>
                    </div>
                `).join('') || '<p>No bookings found</p>'}
            </div>
        `;
    }

    renderWalletPage() {
        return `
            <div class="wallet-section">
                <h3>Current Balance</h3>
                <h2>₹${currentUser.walletBalance}</h2>
                <button onclick="handleAddMoney()" class="add-money-btn">Add Money</button>
            </div>
            <div class="transaction-history">
                <h3>Recent Transactions</h3>
                ${currentUser.bookings.map(booking => `
                    <div class="transaction-item">
                        <div class="transaction-details">
                            <p>${booking.locationName}</p>
                            <p class="date">${booking.startTime.toLocaleDateString()}</p>
                        </div>
                        <p class="amount">-₹${booking.cost}</p>
                    </div>
                `).join('') || '<p>No transactions found</p>'}
            </div>
        `;
    }

    closeProfilePage() {
        const profilePage = document.getElementById('profilePage');
        const overlay = document.getElementById('overlay');
        
        profilePage.classList.remove('active');
        overlay.classList.remove('active');
    }

    handleLogout() {
        if(confirm('Are you sure you want to logout?')) {
            // Add logout logic here
            alert('Logged out successfully');
            window.location.reload();
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const app = new ParkingMap();
    
    // Setup global handlers immediately
    window.handleBooking = (event, locationId) => app.handleBooking(event, locationId);
    window.showProfilePage = (page) => app.showProfilePage(page);
    window.closeProfilePage = () => app.closeProfilePage();
    window.handleLogout = () => app.handleLogout();
    window.handleAddMoney = () => app.handleAddMoney();
    window.handleCancelBooking = (bookingId) => app.handleCancelBooking(bookingId);
    
    // Initialize with a small delay to ensure DOM is ready
    requestAnimationFrame(() => {
        app.initialize().catch(error => {
            console.error('Application initialization error:', error);
        });
    });
});