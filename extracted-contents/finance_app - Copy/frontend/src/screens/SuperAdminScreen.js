import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { api } from '../api';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const clearStorage = async () => {
    if (Platform.OS === 'web') {
        localStorage.clear();
    } else {
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('role');
    }
};

export default function SuperAdminScreen() {
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [companyName, setCompanyName] = useState('');
    const [adminUsername, setAdminUsername] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const navigation = useNavigation();

    useEffect(() => {
        loadTenants();
    }, []);

    const loadTenants = async () => {
        try {
            const res = await api.get('/super/tenants');
            setTenants(res.data);
        } catch (e) {
            alert('Failed to load tenants');
        } finally {
            setLoading(false);
        }
    };

    const [allowedFeatures, setAllowedFeatures] = useState('');

    const handleCreateTenant = async () => {
        if (!companyName || !adminUsername || !adminPassword) return alert("Fill all fields");
        try {
            await api.post('/super/tenants', {
                company_name: companyName,
                admin_username: adminUsername,
                admin_password: adminPassword,
                allowed_features: allowedFeatures || 'ALL'
            });
            alert('SaaS Client created successfully!');
            setCompanyName('');
            setAdminUsername('');
            setAdminPassword('');
            setAllowedFeatures('');
            loadTenants();
        } catch (e) {
            alert('Creation failed');
        }
    };

    const handleLogout = async () => {
        await clearStorage();
        navigation.replace('Login');
    };

    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
                <Text style={styles.headerTitle}>SaaS Super Admin</Text>
                <TouchableOpacity onPress={handleLogout}>
                    <Text style={{color: 'red', fontWeight: 'bold'}}>Logout</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Provision New Client</Text>
                <TextInput style={styles.input} placeholder="Company Name" value={companyName} onChangeText={setCompanyName} />
                <TextInput style={styles.input} placeholder="Admin Username" value={adminUsername} onChangeText={setAdminUsername} autoCapitalize="none" />
                <TextInput style={styles.input} placeholder="Admin Password" value={adminPassword} onChangeText={setAdminPassword} secureTextEntry />
                <TextInput style={styles.input} placeholder="Allowed Loan Types (e.g., TWO_WHEELER,GIRVI or ALL)" value={allowedFeatures} onChangeText={setAllowedFeatures} autoCapitalize="characters" />
                <TouchableOpacity style={styles.btn} onPress={handleCreateTenant}>
                    <Text style={{color: '#fff', fontWeight: 'bold'}}>Create Client</Text>
                </TouchableOpacity>
            </View>

            <View style={[styles.card, {flex: 1}]}>
                <Text style={styles.cardTitle}>Active Clients ({tenants.length})</Text>
                {loading ? <ActivityIndicator size="large" /> : (
                    tenants.map(t => (
                        <View key={t.id} style={styles.tenantRow}>
                            <View>
                                <Text style={{fontWeight: 'bold', fontSize: 16}}>{t.company_name}</Text>
                                <Text style={{color: '#666', fontSize: 12}}>Features: {t.allowed_features}</Text>
                            </View>
                            <View style={{backgroundColor: t.is_active ? '#2ecc71' : '#e74c3c', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5}}>
                                <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>{t.is_active ? 'ACTIVE' : 'DISABLED'}</Text>
                            </View>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8', padding: 15 },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center', marginTop: 30 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#2e64e5' },
    card: { backgroundColor: '#fff', padding: 15, borderRadius: 8, elevation: 2, marginBottom: 20 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginBottom: 10 },
    btn: { backgroundColor: '#2e64e5', padding: 15, borderRadius: 5, alignItems: 'center' },
    tenantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }
});
