import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform, ScrollView } from 'react-native';
import { getCollections, getReportTrends, API_BASE_URL } from '../api';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { BarChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const screenWidth = Dimensions.get('window').width;

export default function CollectionHistoryScreen() {
    const [collections, setCollections] = useState([]);
    const [trends, setTrends] = useState([]);
    const [activeTab, setActiveTab] = useState('HISTORY'); // 'HISTORY' or 'REPORTS'
    
    // Filters
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
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

    // Modals
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : '';
    const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : '';

    const fetchCollections = async () => {
        try {
            const res = await getCollections(startStr, endStr, financeType, paymentMethod);
            setCollections(res.data);
            
            const tr = await getReportTrends();
            setTrends(tr.data);
        } catch (e) {
            console.error('Error fetching collections:', e);
        }
    };

    useEffect(() => {
        fetchCollections();
    }, [startDate, endDate, financeType, paymentMethod, activeTab]);

    const calculateStats = () => {
        let total = 0;
        let cash = 0;
        let online = 0;
        let base = 0;
        let extra = 0;
        
        collections.forEach(c => {
            const amt = (c.amount || 0);
            const ext = (c.late_fee || 0) + (c.other_charges || 0);
            const tot = amt + ext;
            total += tot;
            base += amt;
            extra += ext;
            if (!c.payment_method || c.payment_method.toUpperCase() === 'CASH') {
                cash += tot;
            } else {
                online += tot;
            }
        });

        return { total, cash, online, base, extra };
    };

    const stats = calculateStats();

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={{flex: 1}}>
                <Text style={styles.name}>{item.customer_name}</Text>
                <Text style={{fontSize: 12, color: '#666', marginBottom: 5}}>Paid On: {item.paid_date}</Text>
                
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2}}>
                    <Text style={{color: '#555'}}>Base Amount:</Text>
                    <Text style={{fontWeight: 'bold'}}>₹{item.amount}</Text>
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2}}>
                    <Text style={{color: '#555'}}>Late Fee / Extra:</Text>
                    <Text style={{fontWeight: 'bold', color: '#e74c3c'}}>₹{(item.late_fee || 0) + (item.other_charges || 0)}</Text>
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: '#eee'}}>
                    <Text style={{color: '#555', fontWeight: 'bold'}}>Total Paid:</Text>
                    <Text style={{fontWeight: 'bold', color: '#2ecc71', fontSize: 16}}>₹{(item.amount || 0) + (item.late_fee || 0) + (item.other_charges || 0)}</Text>
                </View>
            </View>
            
            <View style={{justifyContent: 'flex-start', alignItems: 'flex-end', paddingLeft: 10}}>
                <View style={[styles.badge, item.payment_method === 'ONLINE' ? {backgroundColor: '#34495e'} : {backgroundColor: '#e67e22'}]}>
                    <Text style={styles.badgeText}>{item.payment_method || 'CASH'}</Text>
                </View>
                <Text style={{fontSize: 10, color: '#aaa', marginTop: 5, textAlign: 'right'}}>{item.finance_type?.replace('_', ' ')}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={{flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd'}}>
                <TouchableOpacity 
                    style={{flex: 1, paddingVertical: 15, borderBottomWidth: activeTab === 'HISTORY' ? 3 : 0, borderColor: '#2e64e5'}}
                    onPress={() => setActiveTab('HISTORY')}
                >
                    <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'HISTORY' ? '#2e64e5' : '#7f8c8d'}}>History</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={{flex: 1, paddingVertical: 15, borderBottomWidth: activeTab === 'REPORTS' ? 3 : 0, borderColor: '#8e44ad'}}
                    onPress={() => setActiveTab('REPORTS')}
                >
                    <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'REPORTS' ? '#8e44ad' : '#7f8c8d'}}>Reports</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'HISTORY' ? (
                <>
                    <View style={styles.filterBox}>
                        <Text style={{fontWeight: 'bold', marginBottom: 5}}>Filter Collections</Text>
                        
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginBottom: 10}}>
                            {['ALL', 'CASH', 'ONLINE'].map(type => (
                                <TouchableOpacity key={type} style={[styles.typeBtn, paymentMethod === type && styles.typeBtnActive]} onPress={() => setPaymentMethod(type)}>
                                    <Text style={[styles.typeBtnText, paymentMethod === type && {color: '#fff'}]}>{type}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginBottom: 10}}>
                            {['ALL', 'TWO_WHEELER', 'FOUR_WHEELER', 'UDHAR', 'INSURANCE', 'PERSONAL', 'GIRVI', 'HOME_LOAN']
                              .filter(type => type === 'ALL' || allowedFeatures === 'ALL' || allowedFeatures.includes(type))
                              .map(type => (
                                <TouchableOpacity key={type} style={[styles.typeBtn, financeType === type && styles.typeBtnActive]} onPress={() => setFinanceType(type)}>
                                    <Text style={[styles.typeBtnText, financeType === type && {color: '#fff'}]}>{type.replace('_', ' ')}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={{flexDirection: 'row', gap: 10}}>
                            {Platform.OS === 'web' ? (
                                <>
                                    <input style={{flex: 1, border: '1px solid #ddd', padding: '8px', borderRadius: '5px'}} type="date" value={startStr} onChange={(e) => { const d=new Date(e.target.value); if(!isNaN(d)) setStartDate(d); else setStartDate(null); }} />
                                    <input style={{flex: 1, border: '1px solid #ddd', padding: '8px', borderRadius: '5px'}} type="date" value={endStr} onChange={(e) => { const d=new Date(e.target.value); if(!isNaN(d)) setEndDate(d); else setEndDate(null); }} />
                                </>
                            ) : (
                                <>
                                    <TouchableOpacity style={styles.filterInput} onPress={() => setShowStartPicker(true)}>
                                        <Text>{startDate ? format(startDate, 'yyyy-MM-dd') : 'Start Date'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.filterInput} onPress={() => setShowEndPicker(true)}>
                                        <Text>{endDate ? format(endDate, 'yyyy-MM-dd') : 'End Date'}</Text>
                                    </TouchableOpacity>
                                    {showStartPicker && <DateTimePicker value={startDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowStartPicker(false); if(d) setStartDate(d); }} />}
                                    {showEndPicker && <DateTimePicker value={endDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowEndPicker(false); if(d) setEndDate(d); }} />}
                                </>
                            )}
                        </View>
                        
                        {(startDate || endDate || financeType !== 'ALL' || paymentMethod !== 'ALL') && (
                            <TouchableOpacity style={{marginTop: 10}} onPress={() => {
                                setStartDate(null); setEndDate(null); setFinanceType('ALL'); setPaymentMethod('ALL');
                            }}>
                                <Text style={{color: '#e74c3c', textAlign: 'center', fontWeight: 'bold'}}>Clear Filters</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={{backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginTop: 10, borderRadius: 8, elevation: 2}}>
                        <Text style={{fontSize: 16, fontWeight: 'bold', marginBottom: 10}}>Collection Analytics</Text>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10}}>
                            <View>
                                <Text style={{color: '#666'}}>Total Collected</Text>
                                <Text style={{fontSize: 18, fontWeight: 'bold', color: '#2ecc71'}}>₹{stats.total}</Text>
                            </View>
                            <View style={{alignItems: 'flex-end'}}>
                                <Text style={{color: '#666'}}>Base / Extra</Text>
                                <Text style={{fontSize: 14, fontWeight: 'bold'}}>₹{stats.base} / <Text style={{color: '#e74c3c'}}>₹{stats.extra}</Text></Text>
                            </View>
                        </View>
                        {stats.total > 0 && (
                            <View style={{height: 10, flexDirection: 'row', borderRadius: 5, overflow: 'hidden', marginTop: 5}}>
                                <View style={{flex: stats.cash, backgroundColor: '#e67e22'}} />
                                <View style={{flex: stats.online, backgroundColor: '#34495e'}} />
                            </View>
                        )}
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 5}}>
                            <Text style={{color: '#e67e22', fontSize: 12, fontWeight: 'bold'}}>Cash: ₹{stats.cash}</Text>
                            <Text style={{color: '#34495e', fontSize: 12, fontWeight: 'bold'}}>Online: ₹{stats.online}</Text>
                        </View>
                    </View>

                    <View style={{flex: 1}}>
                        <FlatList
                            data={collections}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={renderItem}
                            contentContainerStyle={{ paddingBottom: 100 }}
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20, color: '#888'}}>No collections found for these filters.</Text>}
                        />
                    </View>
                </>
            ) : (
                <ScrollView contentContainerStyle={{paddingBottom: 100}}>
                    <View style={{backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginTop: 15, borderRadius: 8, elevation: 2}}>
                        <Text style={{fontSize: 16, fontWeight: 'bold', marginBottom: 15}}>Weekly Collection Trends</Text>
                        {trends.length > 0 ? (
                            <BarChart
                                data={{
                                    labels: trends.slice(-5).map(t => t.week.split('-')[1]),
                                    datasets: [{ data: trends.slice(-5).map(t => t.total_collection) }]
                                }}
                                width={screenWidth - 60}
                                height={220}
                                yAxisLabel="₹"
                                chartConfig={{
                                    backgroundColor: '#fff',
                                    backgroundGradientFrom: '#fff',
                                    backgroundGradientTo: '#fff',
                                    decimalPlaces: 0,
                                    color: (opacity = 1) => `rgba(142, 68, 173, ${opacity})`,
                                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                }}
                                style={{marginVertical: 8, borderRadius: 8}}
                            />
                        ) : (
                            <Text style={{color: '#888'}}>No trend data available.</Text>
                        )}

                        <Text style={{fontWeight: 'bold', marginTop: 15, marginBottom: 5}}>Recent Weeks</Text>
                        {trends.slice(-5).reverse().map((t, idx) => (
                            <View key={idx} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee'}}>
                                <Text style={{fontWeight: 'bold'}}>Week {t.week.split('-')[1]}</Text>
                                <View style={{alignItems: 'flex-end'}}>
                                    <Text style={{color: '#2ecc71', fontWeight: 'bold'}}>₹{t.total_collection}</Text>
                                    <Text style={{fontSize: 10, color: '#666'}}>Cash: {t.cash_collection} | Online: {t.online_collection}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}
        </View>        
    );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  filterBox: { padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  filterInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 5, justifyContent: 'center' },
  typeBtn: { paddingHorizontal: 15, paddingVertical: 6, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, marginRight: 10 },
  typeBtnActive: { backgroundColor: '#2e64e5', borderColor: '#2e64e5' },
  typeBtnText: { color: '#555', fontSize: 12, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginTop: 10, borderRadius: 8, elevation: 2, flexDirection: 'row' },
  name: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});