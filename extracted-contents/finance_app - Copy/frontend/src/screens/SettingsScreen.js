import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { api, getSettings, updateSettings, API_BASE_URL } from '../api';
import { universalAlert } from '../utils';

const getStorage = async (key) => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
};

const clearStorage = async () => {
    if (Platform.OS === 'web') {
        localStorage.clear();
    } else {
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('role');
    }
};

export default function SettingsScreen({ navigation }) {
    const [role, setRole] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [companyPhone, setCompanyPhone] = useState('');
    const [companyLogo, setCompanyLogo] = useState('');
    const [upiId, setUpiId] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [lifetimeProfit, setLifetimeProfit] = useState(0);
    
    // Change Password Form
    const [newPassword, setNewPassword] = useState('');

    // Add Agent Form
    const [newAgentUser, setNewAgentUser] = useState('');
    const [newAgentPass, setNewAgentPass] = useState('');

    const pickImage = async (setter) => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.3,
            base64: true
        });
  
        if (!result.canceled && result.assets && result.assets.length > 0) {
            const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
            setter(base64Img);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            const storedRole = await getStorage('role');
            setRole(storedRole);
            
            try {
                const res = await getSettings();
                setCompanyName(res.data.company_name || '');
                setCompanyPhone(res.data.company_phone || '');
                setCompanyLogo(res.data.company_logo || '');
                setUpiId(res.data.upi_id || '');
                setQrCodeUrl(res.data.qr_code_url || '');
                setLifetimeProfit(res.data.lifetime_profit || 0);
            } catch (e) {
                console.error(e);
            }
        };
        loadData();
    }, []);

    const handleSaveSettings = async () => {
        try {
            await updateSettings({ 
                company_name: companyName, 
                company_phone: companyPhone, 
                company_logo: companyLogo, 
                upi_id: upiId, 
                qr_code_url: qrCodeUrl 
            });
            universalAlert('Success', 'Company Settings Updated!', []);
        } catch (e) {
            universalAlert('Error', 'Failed to update settings', []);
        }
    };

    const handleLogout = async () => {
        await clearStorage();
        navigation.replace('Login');
    };

    const handleChangePassword = async () => {
        try {
            // Need user ID from token in a real app, assuming 1 for simplicity in demo or passing userId via AsyncStorage.
            // Simplified here just showing the form interaction.
            universalAlert('Notice', 'Password change endpoint called (Mocked in UI)', []);
            setNewPassword('');
        } catch (e) {
            universalAlert('Error', 'Failed to change password', []);
        }
    };

    const handleBackupDatabase = () => {
        Linking.openURL(`${API_BASE_URL}/backup`);
    };

    const handleAddAgent = async () => {
        if (role !== 'ADMIN') return universalAlert('Error', 'Only admins can add agents', []);
        
        try {
            await api.post('/users', { username: newAgentUser, password: newAgentPass, role: 'AGENT' });
            universalAlert('Success', 'New agent user added!', []);
            setNewAgentUser('');
            setNewAgentPass('');
        } catch (e) {
            universalAlert('Error', 'Failed to add user', []);
        }
    };

    return (
        <ScrollView style={styles.container}>
            {role === 'ADMIN' && (
                <View style={[styles.section, {backgroundColor: '#2e64e5'}]}>
                    <Text style={[styles.sectionTitle, {color: '#fff', textAlign: 'center'}]}>Lifetime Extra Profit (AI Analytics)</Text>
                    <Text style={{color: '#fff', fontSize: 32, fontWeight: 'bold', textAlign: 'center'}}>₹{lifetimeProfit.toFixed(2)}</Text>
                    <Text style={{color: '#ddd', fontSize: 12, textAlign: 'center', marginTop: 5}}>From Late Fees & Extra Charges</Text>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Company Info & Branding</Text>
                <TextInput style={styles.input} placeholder="Company Name" value={companyName} onChangeText={setCompanyName} />
                <TextInput style={styles.input} placeholder="Company Phone" value={companyPhone} onChangeText={setCompanyPhone} keyboardType="phone-pad" />
                <Text style={styles.label}>Company Logo (Optional)</Text>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10}}>
                    <TouchableOpacity style={[styles.btn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={() => pickImage(setCompanyLogo)}>
                        <Text style={styles.btnText}>📷 Upload Logo</Text>
                    </TouchableOpacity>
                    {companyLogo && companyLogo.startsWith('data:') ? <Text style={{color: '#2ecc71', fontWeight: 'bold', fontSize: 12}}>✓ Selected</Text> : <Text style={{color: '#888', fontSize: 12}}>No Logo</Text>}
                </View>
                
                <Text style={styles.sectionTitle}>Payment Details (For Receipts)</Text>
                <TextInput style={styles.input} placeholder="UPI ID" value={upiId} onChangeText={setUpiId} autoCapitalize="none" />
                <Text style={styles.label}>QR Code (For PDF Invoices)</Text>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10}}>
                    <TouchableOpacity style={[styles.btn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={() => pickImage(setQrCodeUrl)}>
                        <Text style={styles.btnText}>📷 Upload QR</Text>
                    </TouchableOpacity>
                    {qrCodeUrl && qrCodeUrl.startsWith('data:') ? <Text style={{color: '#2ecc71', fontWeight: 'bold', fontSize: 12}}>✓ Selected</Text> : <Text style={{color: '#888', fontSize: 12}}>No QR</Text>}
                </View>

                <TouchableOpacity style={styles.btn} onPress={handleSaveSettings}>
                    <Text style={styles.btnText}>Save Settings</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Change Password</Text>
                <TextInput style={styles.input} placeholder="New Password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
                <TouchableOpacity style={styles.btn} onPress={handleChangePassword}>
                    <Text style={styles.btnText}>Update Password</Text>
                </TouchableOpacity>
            </View>

            {role === 'ADMIN' && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Add New Agent (Admin Only)</Text>
                    <TextInput style={styles.input} placeholder="Agent Username" autoCapitalize="none" value={newAgentUser} onChangeText={setNewAgentUser} />
                    <TextInput style={styles.input} placeholder="Agent Password" secureTextEntry value={newAgentPass} onChangeText={setNewAgentPass} />
                    <TouchableOpacity style={[styles.btn, {backgroundColor: '#27ae60'}]} onPress={handleAddAgent}>
                        <Text style={styles.btnText}>Add Agent</Text>
                    </TouchableOpacity>
                </View>
            )}

            {role === 'ADMIN' && (
                <View style={[styles.section, {backgroundColor: '#e8f8f5'}]}>
                    <Text style={styles.sectionTitle}>Advanced Settings</Text>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: '#16a085' }]} onPress={handleBackupDatabase}>
                        <Text style={styles.btnText}>📥 Backup Database (SQLite)</Text>
                    </TouchableOpacity>
                </View>
            )}

            <TouchableOpacity style={[styles.btn, {backgroundColor: '#e74c3c', marginTop: 30}]} onPress={handleLogout}>
                <Text style={styles.btnText}>Logout</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8', padding: 20 },
    section: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 20, elevation: 2 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10 },
    btn: { backgroundColor: '#3498db', padding: 12, borderRadius: 8, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: 'bold' },
    label: { fontSize: 14, color: '#666', marginBottom: 5 }
});