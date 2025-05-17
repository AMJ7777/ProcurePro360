const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');

const authController = {
    // Register user
    register: async (req, res) => {
        try {
            const { username, email, password } = req.body;

            // Check if user exists
            const userExists = await User.findByEmail(email);
            if (userExists) {
                return res.status(400).json({ message: 'User already exists' });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Create user
            const user = {
                username,
                email,
                password: hashedPassword
            };

            const newUser = await User.create(user);

            res.status(201).json({
                message: 'User registered successfully',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email
                }
            });
        } catch (error) {
            res.status(500).json({ message: 'Error in registration', error: error.message });
        }
    },

    // Login user
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            // Check if user exists
            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            // Create token
            const token = jwt.sign(
                { id: user.id },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            res.json({
                message: 'Logged in successfully',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });
        } catch (error) {
            res.status(500).json({ message: 'Error in login', error: error.message });
        }
    },

    // Forgot password
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            // Implement forgot password logic
            res.json({ message: 'Password reset instructions sent' });
        } catch (error) {
            res.status(500).json({ message: 'Error in forgot password', error: error.message });
        }
    },

    // Reset password
    resetPassword: async (req, res) => {
        try {
            const { token } = req.params;
            const { password } = req.body;
            // Implement reset password logic
            res.json({ message: 'Password reset successful' });
        } catch (error) {
            res.status(500).json({ message: 'Error in reset password', error: error.message });
        }
    },

    // Change password
    changePassword: async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            // Implement change password logic
            res.json({ message: 'Password changed successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error in change password', error: error.message });
        }
    },

    // Get user profile
    getProfile: async (req, res) => {
        try {
            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json({
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });
        } catch (error) {
            res.status(500).json({ message: 'Error fetching profile', error: error.message });
        }
    },

    // Update profile
    updateProfile: async (req, res) => {
        try {
            const { username, email } = req.body;
            // Implement update profile logic
            res.json({ message: 'Profile updated successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating profile', error: error.message });
        }
    },

    // Logout
    logout: async (req, res) => {
        try {
            // Implement logout logic
            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error in logout', error: error.message });
        }
    }
};

module.exports = authController;