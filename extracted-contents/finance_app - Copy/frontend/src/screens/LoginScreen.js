import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api';
import { universalAlert } from '../utils';

// Fallback for Web since SecureStore doesn't work on Web
const setStorage = async (key, value) => {
    if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
    } else {
        await SecureStore.setItemAsync(key, value);
    }
};

export default function LoginScreen({ navigation }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) return universalAlert('Error', 'Please enter both username and password', []);
        
        try {
            const res = await api.post('/login', { username: username.trim(), password });
            await setStorage('token', res.data.token);
            await setStorage('role', res.data.user.role);
            await setStorage('features', res.data.user.features || 'ALL');
            
            // Set default headers for subsequent requests
            api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
            
            if (res.data.user.role === 'SUPER_ADMIN') {
                navigation.replace('SuperAdmin');
            } else {
                navigation.replace('Home');
            }
        } catch (error) {
            universalAlert('Login Failed', error.message || 'Unknown network error. Check terminal.', []);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>FinTrack</Text>
            <Text style={styles.subtitle}>Sign in to manage your finances</Text>
            
            <TextInput
                style={styles.input}
                placeholder="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
            />
            <View style={[styles.input, {flexDirection: 'row', alignItems: 'center', padding: 0}]}>
                <TextInput
                    style={{flex: 1, padding: 15}}
                    placeholder="Password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                />
                <TouchableOpacity style={{padding: 15}} onPress={() => setShowPassword(!showPassword)}>
                    <Text style={{color: '#2e64e5', fontWeight: 'bold'}}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>Login</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f4f6f8' },
    title: { fontSize: 32, fontWeight: 'bold', color: '#2e64e5', textAlign: 'center', marginBottom: 5 },
    subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 30 },
    input: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
    button: { backgroundColor: '#2e64e5', padding: 15, borderRadius: 8, alignItems: 'center' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});