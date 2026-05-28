import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, FlatList, TouchableOpacity, TextInput, Linking, Modal, Platform } from 'react-native';
import { getDashboardStats, getOverdueInstallments, getTodayInstallments, getUpcomingInstallments, updateInstallmentStatus, getSettings, getExportCustomers, getExportUpcoming } from '../api';
import { useNavigation } from '@react-navigation/native';
import { documentDirectory, writeAsStringAsync } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { universalAlert } from '../utils';
import { PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;

export default function DashboardScreen() {
  const navigation = useNavigation();
  
  // Dashboard Aggregation State (Totals, Counts)
  const [stats, setStats] = useState({
    totalCollected: 0,
    totalOutstanding: 0,
    totalDelayed: 0,
    delayedInstallmentsCount: 0,
    totalLateFees: 0,
    thisMonthCollection: 0,
    totalCustomersCount: 0,
    totalCash: 0,
    totalOnline: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  
  // List States for Tabs
  const [overdue, setOverdue] = useState([]);
  const [today, setToday] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [companyName, setCompanyName] = useState('FinTrack');
  
  // Global Date & Type Filtering State (Affects all backend queries)
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [financeType, setFinanceType] = useState('ALL');

  // Search filter for Dashboard Lists
  const [searchQuery, setSearchQuery] = useState('');

  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState('OVERDUE'); // 'OVERDUE', 'TODAY', 'UPCOMING'

  // Date Pickers
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Payment Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedInst, setSelectedInst] = useState(null);
  const [modalAmount, setModalAmount] = useState('');
  const [modalLateFee, setModalLateFee] = useState('');
  const [modalOtherCharges, setModalOtherCharges] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidDateObj, setPaidDateObj] = useState(new Date());
  const [showPaidDatePicker, setShowPaidDatePicker] = useState(false);
  const finalTotalAmount = (parseFloat(modalAmount) || 0) + (parseFloat(modalLateFee) || 0) + (parseFloat(modalOtherCharges) || 0);

  const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : '';
  const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : '';

  const fetchStats = async () => {
    try {
      const response = await getDashboardStats(startStr, endStr, financeType);
      setStats({
          totalCollected: response.data.totalCollected || 0,
          totalOutstanding: response.data.totalOutstanding || 0,
          totalDelayed: response.data.totalDelayed || 0,
          delayedInstallmentsCount: response.data.delayedInstallmentsCount || 0,
          totalLateFees: response.data.totalLateFees || 0,
          thisMonthCollection: response.data.thisMonthCollection || 0,
          totalCustomersCount: response.data.totalCustomersCount || 0,
          totalCash: response.data.totalCash || 0,
          totalOnline: response.data.totalOnline || 0,
      });
      
      const overdueRes = await getOverdueInstallments(startStr, endStr, financeType);
      setOverdue(overdueRes.data);
      
      const todayRes = await getTodayInstallments(startStr, endStr, financeType);
      setToday(todayRes.data);

      const upcomingRes = await getUpcomingInstallments(startStr, endStr, financeType);
      setUpcoming(upcomingRes.data);
      
      const settingsRes = await getSettings();
      if (settingsRes.data && settingsRes.data.company_name) {
          setCompanyName(settingsRes.data.company_name);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats().then(() => setRefreshing(false));
  }, [startDate, endDate, financeType]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
        fetchStats();
    });
    return unsubscribe;
  }, [navigation, startDate, endDate, financeType]);

  const handleOpenPayment = (inst) => {
      setSelectedInst(inst);
      setModalAmount(inst.amount.toString());
      setModalLateFee('0');
      setModalOtherCharges('0');
      setPaymentMethod('CASH');
      setPaidDateObj(new Date());
      setModalVisible(true);
  };

  const submitPayment = async () => {
      try {
          const pdStr = format(paidDateObj, 'yyyy-MM-dd');
          await updateInstallmentStatus(
              selectedInst.id, 
              'PAID', 
              parseFloat(modalAmount) || selectedInst.amount, 
              parseFloat(modalLateFee) || 0, 
              parseFloat(modalOtherCharges) || 0,
              paymentMethod,
              pdStr
          );
          setModalVisible(false);
          fetchStats();
          Alert.alert('Success', 'Installment Marked Paid!');
      } catch (e) {
          Alert.alert("Error", "Failed to submit payment");
      }
  };

  const generateAndShareCSV = async (type) => {
      try {
          let response;
          let filename = '';
          if (type === 'CUSTOMERS') {
              response = await getExportCustomers(financeType);
              filename = 'customers_export.csv';
          } else {
              response = await getExportUpcoming(startStr, endStr, financeType);
              filename = 'upcoming_export.csv';
          }
          
          const data = response.data;
          if (!data || data.length === 0) return universalAlert('Notice', 'No data to export.', []);

          // Generate CSV String locally to bypass network download issues
          const header = Object.keys(data[0]).join(',');
          const rows = data.map(obj => Object.values(obj).map(val => `"${val}"`).join(',')).join('\n');
          const csvString = `${header}\n${rows}`;

          if (Platform.OS === 'web') {
              const blob = new Blob([csvString], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              a.click();
              window.URL.revokeObjectURL(url);
          } else {
              const fileUri = `${documentDirectory || ''}${filename}`;
              await writeAsStringAsync(fileUri, csvString);

              if (await isAvailableAsync()) {
                  await shareAsync(fileUri);
              } else {
                  universalAlert('Success', `File saved locally: ${fileUri}`, []);
              }
          }
      } catch (err) {
          console.error(err);
          universalAlert('Error', 'An error occurred during CSV generation.', []);
      }
  };

  const renderInstCard = (item) => (
      <View key={item.id} style={styles.listCard}>
          <View style={{flex: 1}}>
              <Text style={styles.listName}>{item.customer_name}</Text>
              <Text style={styles.listDate}>Due: {item.due_date}</Text>
              <Text style={styles.listAmt}>₹{item.amount}</Text>
              
              <Text style={{fontSize: 10, color: '#e74c3c', fontWeight: 'bold'}}>{item.loan_code}</Text>
              {item.finance_type === 'GIRVI' && item.collateral_name ? (
                  <Text style={{fontSize: 12, color: '#666'}}>{item.collateral_name} ({item.collateral_weight} {item.collateral_weight_unit})</Text>
              ) : (
                  item.vehicle_name ? <Text style={{fontSize: 12, color: '#666'}}>{item.vehicle_name} ({item.vendor_name})</Text> : null
              )}

              <View style={{flexDirection: 'row', gap: 10, marginTop: 8}}>
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:+91${item.customer_phone}`)}>
                      <Text style={{color: '#3498db', fontWeight: 'bold'}}>📞 Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                      const msg = `Hello ${item.customer_name}, your ${item.finance_type} installment of ₹${item.amount} is due on ${item.due_date}. Regards, ${companyName}`;
                      const url = Platform.OS === 'web' 
                          ? `https://wa.me/91${item.customer_phone}?text=${encodeURIComponent(msg)}`
                          : `whatsapp://send?phone=+91${item.customer_phone}&text=${encodeURIComponent(msg)}`;
                      Linking.openURL(url);
                  }}>
                      <Text style={{color: '#25D366', fontWeight: 'bold'}}>💬 WhatsApp</Text>
                  </TouchableOpacity>
              </View>
          </View>
          <TouchableOpacity style={styles.payBtn} onPress={() => handleOpenPayment(item)}>
              <Text style={{color: '#fff', fontWeight: 'bold'}}>Pay Now</Text>
          </TouchableOpacity>
      </View>
  );

  return (
    <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>FinTrack Overview</Text>
      </View>

      <View style={styles.filterBox}>
          <Text style={{fontWeight: 'bold', marginBottom: 5}}>Global Filter</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginBottom: 10}}>
              {['ALL', 'TWO_WHEELER', 'FOUR_WHEELER', 'UDHAR', 'INSURANCE', 'PERSONAL'].map(type => (
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

                      {showStartPicker && (
                          <DateTimePicker
                              value={startDate || new Date()} mode="date" display="default"
                              onChange={(event, date) => {
                                  setShowStartPicker(false);
                                  if(date) setStartDate(date);
                              }}
                          />
                      )}

                      {showEndPicker && (
                          <DateTimePicker
                              value={endDate || new Date()} mode="date" display="default"
                              onChange={(event, date) => {
                                  setShowEndPicker(false);
                                  if(date) setEndDate(date);
                              }}
                          />
                      )}
                  </>
              )}
          </View>

          <TouchableOpacity style={styles.filterBtn} onPress={fetchStats}>
              <Text style={{color: 'white', textAlign: 'center', fontWeight: 'bold'}}>Apply Filters</Text>
          </TouchableOpacity>
          
          {(startDate || endDate || financeType !== 'ALL') && (
              <TouchableOpacity style={{marginTop: 10}} onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setFinanceType('ALL');
              }}>
                  <Text style={{color: '#e74c3c', textAlign: 'center', fontWeight: 'bold'}}>Clear Filters</Text>
              </TouchableOpacity>
          )}
      </View>

      <View style={{flexDirection: 'row', gap: 10, marginHorizontal: 15, marginTop: 15}}>
          <TouchableOpacity style={[styles.filterBtn, {flex: 1, backgroundColor: '#27ae60', marginTop: 0}]} onPress={() => generateAndShareCSV('CUSTOMERS')}>
              <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>📥 Export Customers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterBtn, {flex: 1, backgroundColor: '#8e44ad', marginTop: 0}]} onPress={() => generateAndShareCSV('UPCOMING')}>
              <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>📥 Export Upcoming</Text>
          </TouchableOpacity>
      </View>

      {stats.totalCollected > 0 && (
          <View style={{ backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginTop: 15, borderRadius: 8, elevation: 2, alignItems: 'center' }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 10, alignSelf: 'flex-start' }}>Collection Breakdown</Text>
              <PieChart
                  data={[
                      { name: 'Cash', population: stats.totalCash || 0, color: '#e67e22', legendFontColor: '#7F7F7F', legendFontSize: 12 },
                      { name: 'Online', population: stats.totalOnline || 0, color: '#34495e', legendFontColor: '#7F7F7F', legendFontSize: 12 }
                  ]}
                  width={screenWidth - 60}
                  height={150}
                  chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
                  accessor={"population"}
                  backgroundColor={"transparent"}
                  paddingLeft={"15"}
                  absolute
              />
          </View>
      )}

      <View style={styles.grid}>
        <TouchableOpacity style={[styles.card, styles.cardCollected]} onPress={() => navigation.navigate('History')}>
          <Text style={styles.cardTitle}>Total Collected</Text>
          <Text style={styles.cardAmount}>₹ {stats.totalCollected.toFixed(2)}</Text>
          <Text style={{color: '#fff', fontSize: 10, marginTop: 5}}>Tap to view history &rarr;</Text>
        </TouchableOpacity>

        <View style={[styles.card, styles.cardOutstanding]}>
          <Text style={styles.cardTitle}>Outstanding Balance</Text>
          <Text style={styles.cardAmount}>₹ {stats.totalOutstanding.toFixed(2)}</Text>
        </View>

        <View style={[styles.card, styles.cardDelayed]}>
          <Text style={styles.cardTitle}>Delayed Amount</Text>
          <Text style={styles.cardAmount}>₹ {stats.totalDelayed.toFixed(2)}</Text>
          <Text style={styles.cardSubText}>{stats.delayedInstallmentsCount} Installments Overdue</Text>
        </View>

        <View style={[styles.card, styles.cardLateFee]}>
          <Text style={styles.cardTitle}>Late Fees Collected</Text>
          <Text style={styles.cardAmount}>₹ {stats.totalLateFees.toFixed(2)}</Text>
        </View>

        <TouchableOpacity style={[styles.card, styles.cardMonthly]} onPress={() => navigation.navigate('History')}>
          <Text style={styles.cardTitle}>This Month Collection</Text>
          <Text style={styles.cardAmount}>₹ {stats.thisMonthCollection.toFixed(2)}</Text>
        </TouchableOpacity>
        
        <View style={[styles.card, styles.cardMonthly]}>
          <Text style={styles.cardTitle}>Total Customers</Text>
          <Text style={styles.cardAmount}>{stats.totalCustomersCount}</Text>
        </View>

        <TouchableOpacity style={[styles.card, {backgroundColor: '#e67e22'}]} onPress={() => navigation.navigate('History')}>
          <Text style={styles.cardTitle}>Cash Collection</Text>
          <Text style={styles.cardAmount}>₹ {stats.totalCash?.toFixed(2) || '0.00'}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.card, {backgroundColor: '#34495e'}]} onPress={() => navigation.navigate('History')}>
          <Text style={styles.cardTitle}>Online Collection</Text>
          <Text style={styles.cardAmount}>₹ {stats.totalOnline?.toFixed(2) || '0.00'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
          <TextInput 
              style={styles.searchInput}
              placeholder="Search Name, Phone, Book or Vehicle..."
              value={searchQuery}
              onChangeText={setSearchQuery}
          />
      </View>

      <View style={{flexDirection: 'row', marginHorizontal: 15, marginTop: 20, borderBottomWidth: 1, borderColor: '#ddd'}}>
          <TouchableOpacity 
              style={{flex: 1, paddingVertical: 10, borderBottomWidth: activeTab === 'OVERDUE' ? 3 : 0, borderColor: '#e74c3c', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5}}
              onPress={() => setActiveTab('OVERDUE')}
          >
              <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'OVERDUE' ? '#e74c3c' : '#7f8c8d'}}>Overdue</Text>
              {overdue.length > 0 && (
                  <View style={{backgroundColor: '#e74c3c', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2}}><Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>{overdue.length}</Text></View>
              )}
          </TouchableOpacity>
          <TouchableOpacity 
              style={{flex: 1, paddingVertical: 10, borderBottomWidth: activeTab === 'TODAY' ? 3 : 0, borderColor: '#f1c40f', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5}}
              onPress={() => setActiveTab('TODAY')}
          >
              <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'TODAY' ? '#f39c12' : '#7f8c8d'}}>Today</Text>
              {today.length > 0 && (
                  <View style={{backgroundColor: '#f39c12', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2}}><Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>{today.length}</Text></View>
              )}
          </TouchableOpacity>
          <TouchableOpacity 
              style={{flex: 1, paddingVertical: 10, borderBottomWidth: activeTab === 'UPCOMING' ? 3 : 0, borderColor: '#3498db', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5}}
              onPress={() => setActiveTab('UPCOMING')}
          >
              <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'UPCOMING' ? '#3498db' : '#7f8c8d'}}>Upcoming</Text>
              {upcoming.length > 0 && (
                  <View style={{backgroundColor: '#3498db', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2}}><Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>{upcoming.length}</Text></View>
              )}
          </TouchableOpacity>
      </View>

      <View style={styles.sectionContainer}>
          {(() => {
              let currentList = [];
              if (activeTab === 'OVERDUE') currentList = overdue;
              else if (activeTab === 'TODAY') currentList = today;
              else currentList = upcoming;

              if (searchQuery.trim().length > 0) {
                  const lowerq = searchQuery.toLowerCase();
                  currentList = currentList.filter(item => 
                      item.customer_name?.toLowerCase().includes(lowerq) || 
                      item.customer_phone?.includes(searchQuery) ||
                      item.vehicle_reg_number?.toLowerCase().includes(lowerq) ||
                      item.vehicle_name?.toLowerCase().includes(lowerq) ||
                      item.loan_code?.toLowerCase().includes(lowerq) ||
                      item.collateral_name?.toLowerCase().includes(lowerq)
                  );
              }

              if (currentList.length === 0) return <Text style={styles.emptyText}>No installments found here.</Text>;
              return currentList.map(renderInstCard);
          })()}
      </View>
      
      <View style={{height: 100}} />

      {/* Payment Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Confirm Payment</Text>
                  
                  <Text style={styles.modalLabel}>Base Amount</Text>
                  <TextInput style={styles.modalInput} value={modalAmount} onChangeText={setModalAmount} keyboardType="numeric" />
                  
                  <Text style={styles.modalLabel}>Late Fees</Text>
                  <TextInput style={styles.modalInput} value={modalLateFee} onChangeText={setModalLateFee} keyboardType="numeric" />

                  <Text style={styles.modalLabel}>Other Charges</Text>
                  <TextInput style={styles.modalInput} value={modalOtherCharges} onChangeText={setModalOtherCharges} keyboardType="numeric" />

                  <Text style={styles.modalLabel}>Paid Date</Text>
                  {Platform.OS === 'web' ? (
                      <input 
                          style={{border: '1px solid #ddd', padding: '10px', borderRadius: '5px', marginBottom: '15px', width: '100%', boxSizing: 'border-box'}} 
                          type="date"
                          value={format(paidDateObj, 'yyyy-MM-dd')} 
                          onChange={(e) => {
                              const d = new Date(e.target.value);
                              if (!isNaN(d.getTime())) setPaidDateObj(d);
                          }} 
                      />
                  ) : (
                      <>
                          <TouchableOpacity style={[styles.modalInput, {justifyContent: 'center', marginBottom: 15}]} onPress={() => setShowPaidDatePicker(true)}>
                              <Text>{format(paidDateObj, 'yyyy-MM-dd')}</Text>
                          </TouchableOpacity>
                          {showPaidDatePicker && (
                              <DateTimePicker
                                  value={paidDateObj} mode="date" display="default"
                                  onChange={(e, d) => { setShowPaidDatePicker(false); if(d) setPaidDateObj(d); }}
                              />
                          )}
                      </>
                  )}

                  <Text style={styles.modalLabel}>Payment Method</Text>
                  <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                      {['CASH', 'ONLINE'].map(method => (
                          <TouchableOpacity 
                              key={method} 
                              style={[styles.typeBtn, paymentMethod === method && styles.typeBtnActive, {flex: 1, alignItems: 'center'}]}
                              onPress={() => setPaymentMethod(method)}
                          >
                              <Text style={[styles.typeBtnText, paymentMethod === method && {color: '#fff'}]}>{method}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <Text style={{fontSize: 18, fontWeight: 'bold', color: '#2ecc71', marginVertical: 10, textAlign: 'center'}}>
                      Final Total: ₹{finalTotalAmount}
                  </Text>

                  <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
                      <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#95a5a6', flex: 1, padding: 10, borderRadius: 5}]} onPress={() => setModalVisible(false)}>
                          <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71', flex: 1, padding: 10, borderRadius: 5}]} onPress={submitPayment}>
                          <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>Save</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  grid: {
    padding: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 10,
  },
  cardAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardSubText: {
    fontSize: 12,
    color: '#ffe',
    marginTop: 5,
  },
  cardCollected: { backgroundColor: '#2ecc71' },
  cardOutstanding: { backgroundColor: '#3498db' },
  cardDelayed: { backgroundColor: '#e74c3c' },
  cardLateFee: { backgroundColor: '#f39c12' },
  cardMonthly: { backgroundColor: '#9b59b6' },
  
  filterBox: { padding: 15, marginHorizontal: 15, backgroundColor: '#fff', borderRadius: 8, marginTop: 10, elevation: 2 },
  filterInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 5 },
  filterBtn: { backgroundColor: '#34495e', padding: 10, borderRadius: 5, marginTop: 10 },
  typeBtn: { paddingHorizontal: 15, paddingVertical: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, marginRight: 10 },
  typeBtnActive: { backgroundColor: '#2e64e5', borderColor: '#2e64e5' },
  typeBtnText: { color: '#555', fontSize: 12, fontWeight: 'bold' },
  
  sectionContainer: { paddingHorizontal: 15, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  listCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  listName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  listDate: { color: '#e74c3c', fontSize: 13, marginTop: 2 },
  listAmt: { fontSize: 16, color: '#2ecc71', fontWeight: 'bold', marginTop: 2 },
  payBtn: { backgroundColor: '#2ecc71', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  emptyText: { color: '#888', fontStyle: 'italic' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 8, width: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  modalLabel: { fontSize: 14, color: '#555', marginBottom: 5 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginBottom: 15 },
  searchContainer: { marginHorizontal: 15, marginTop: 15 },
  searchInput: { backgroundColor: '#fff', padding: 10, borderRadius: 8, fontSize: 16, borderWidth: 1, borderColor: '#ddd' }
});
