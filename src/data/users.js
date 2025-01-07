export const users = [
    {
        id: 1,
        username: "demo_user",
        name: "Demo User",
        email: "demo@example.com",
        walletBalance: 500,
        bookings: []
    }
];

export let currentUser = users[0]; // For demo purposes, auto-login as demo user

export function updateWalletBalance(amount) {
    currentUser.walletBalance += amount;
}
