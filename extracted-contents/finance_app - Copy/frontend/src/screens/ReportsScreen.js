import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Platform } from 'react-native';
import { api, getSettings } from '../api';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { sendWhatsAppMessage } from '../utils';
import * as SecureStore from 'expo-secure-store';

export default function ReportsScreen() {
    const [report, setReport] = useState(null);
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(false);

    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const [financeType, setFinanceType] = useState('ALL');
    const [paymentMethod, setPaymentMethod] = useState('ALL');
    const [allowedFeatures, setAllowedFeatures] = useState('ALL');

    useEffect(() => {
        const fetchFeatures = async () => {
            let features = 'ALL';
            if (Platform.OS === 'web') {
                features = localStorage.getItem('features') || 'ALL';
            } else {
                features = await SecureStore.getItemAsync('features') || 'ALL';
            }
            setAllowedFeatures(features);
        };
        fetchFeatures();
    }, []);

    useEffect(() => {
        getSettings().then(res => setSettings(res.data)).catch(console.error);
        fetchReport();
    }, [startDate, endDate, financeType, paymentMethod]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            let url = `/reports/daily?`;
            if (startDate && endDate) {
                url += `startDate=${format(startDate, 'yyyy-MM-dd')}&endDate=${format(endDate, 'yyyy-MM-dd')}&`;
            }
            if (financeType !== 'ALL') url += `financeType=${financeType}&`;
            if (paymentMethod !== 'ALL') url += `paymentMethod=${paymentMethod}`;

            const res = await api.get(url);
            setReport(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const renderLatePayer = ({ item }) => (
        <View style={styles.card}>
            <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.customer_name}</Text>
                <Text style={styles.sub}>Loan: {item.loan_code} ({item.finance_type})</Text>
                <Text style={[styles.sub, {color: '#e74c3c'}]}>Due: {item.due_date} | Amount: ₹{item.amount}</Text>
            </View>
            <TouchableOpacity style={styles.waBtn} onPress={() => {
                sendWhatsAppMessage(
                    item.customer_phone,
                    settings.whatsapp_template_overdue,
                    item.customer_name,
                    item.amount,
                    item.due_date,
                    settings.company_name
                );
            }}>
                <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 12}}>💬 WhatsApp</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.filterBox}>
                <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                    {Platform.OS === 'web' ? (
                        <>
                            <input style={styles.webInput} type="date" value={format(startDate, 'yyyy-MM-dd')} onChange={(e) => setStartDate(new Date(e.target.value))} />
                            <input style={styles.webInput} type="date" value={format(endDate, 'yyyy-MM-dd')} onChange={(e) => setEndDate(new Date(e.target.value))} />
                        </>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.filterInput} onPress={() => setShowStartPicker(true)}>
                                <Text>{format(startDate, 'yyyy-MM-dd')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.filterInput} onPress={() => setShowEndPicker(true)}>
                                <Text>{format(endDate, 'yyyy-MM-dd')}</Text>
                            </TouchableOpacity>
                            {showStartPicker && <DateTimePicker value={startDate} mode="date" display="default" onChange={(e, d) => { setShowStartPicker(false); if(d) setStartDate(d); }} />}
                            {showEndPicker && <DateTimePicker value={endDate} mode="date" display="default" onChange={(e, d) => { setShowEndPicker(false); if(d) setEndDate(d); }} />}
                        </>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginBottom: 10}}>
                    {['ALL', 'CASH', 'ONLINE'].map(type => (
                        <TouchableOpacity key={type} style={[styles.typeBtn, paymentMethod === type && styles.typeBtnActive]} onPress={() => setPaymentMethod(type)}>
                            <Text style={[styles.typeBtnText, paymentMethod === type && {color: '#fff'}]}>{type}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row'}}>
                    {['ALL', 'TWO_WHEELER', 'FOUR_WHEELER', 'UDHAR', 'INSURANCE', 'PERSONAL', 'GIRVI']
                        .filter(type => type === 'ALL' || allowedFeatures === 'ALL' || allowedFeatures.includes(type))
                        .map(type => (
                        <TouchableOpacity key={type} style={[styles.typeBtn, financeType === type && styles.typeBtnActive]} onPress={() => setFinanceType(type)}>
                            <Text style={[styles.typeBtnText, financeType === type && {color: '#fff'}]}>{type.replace('_', ' ')}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {report && (
                <FlatList
                    ListHeaderComponent={() => (
                        <View>
                            <View style={styles.summaryContainer}>
                                <View style={styles.summaryBox}>
                                    <Text style={styles.summaryLabel}>Total Collections</Text>
                                    <Text style={[styles.summaryVal, {color: '#2ecc71'}]}>₹{report.totalCollections?.total || 0}</Text>
                                </View>
                                <View style={styles.summaryBox}>
                                    <Text style={styles.summaryLabel}>New Loans</Text>
                                    <Text style={[styles.summaryVal, {color: '#3498db'}]}>{report.newLoans?.count || 0}</Text>
                                    <Text style={{fontSize: 10, color: '#666'}}>₹{report.newLoans?.total_amount || 0}</Text>
                                </View>
                            </View>
                            <Text style={styles.sectionTitle}>Late Payers ({report.latePayers?.length || 0})</Text>
                        </View>
                    )}
                    data={report.latePayers || []}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderLatePayer}
                    contentContainerStyle={{ padding: 15 }}
                    ListEmptyComponent={<Text style={{textAlign: 'center', color: '#888', marginTop: 20}}>No late payers for this criteria.</Text>}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    filterBox: { padding: 15, backgroundColor: '#fff', elevation: 2 },
    filterInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 5, justifyContent: 'center' },
    webInput: { flex: 1, border: '1px solid #ddd', padding: '8px', borderRadius: '5px' },
    typeBtn: { paddingHorizontal: 15, paddingVertical: 6, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, marginRight: 10 },
    typeBtnActive: { backgroundColor: '#2e64e5', borderColor: '#2e64e5' },
    typeBtnText: { color: '#555', fontSize: 12, fontWeight: 'bold' },
    summaryContainer: { flexDirection: 'row', gap: 15, marginBottom: 20 },
    summaryBox: { flex: 1, backgroundColor: '#fff', padding: 15, borderRadius: 8, elevation: 2, alignItems: 'center' },
    summaryLabel: { color: '#666', fontSize: 12, fontWeight: 'bold' },
    summaryVal: { fontSize: 24, fontWeight: 'bold', marginVertical: 5 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    card: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 2, flexDirection: 'row', alignItems: 'center' },
    name: { fontSize: 16, fontWeight: 'bold' },
    sub: { fontSize: 12, color: '#666', marginTop: 2 },
    waBtn: { backgroundColor: '#25D366', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5 }
});
