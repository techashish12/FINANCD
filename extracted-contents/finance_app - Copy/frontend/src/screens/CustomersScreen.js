import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Image, Platform } from 'react-native';
import { getCustomers, bulkImportCustomers } from '../api';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Papa from 'papaparse';
import { universalAlert } from '../utils';

export default function CustomersScreen() {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchCustomers = navigation.addListener('focus', () => {
        loadCustomers();
    });
    return fetchCustomers;
  }, [navigation]);

  const loadCustomers = async () => {
    try {
      const response = await getCustomers();
      setCustomers(response.data);
      setFilteredCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text) => {
      setSearchQuery(text);
      if (text) {
          const lowerText = text.toLowerCase();
          const filtered = customers.filter(c => 
              c.name.toLowerCase().includes(lowerText) || 
              c.phone.includes(text) ||
              (c.book_number && c.book_number.toLowerCase().includes(lowerText)) ||
              (c.vehicle_reg_number && c.vehicle_reg_number.toLowerCase().includes(lowerText)) ||
              (c.vehicle_name && c.vehicle_name.toLowerCase().includes(lowerText))
          );
          setFilteredCustomers(filtered);
      } else {
          setFilteredCustomers(customers);
      }
  };

  const handleBulkImport = async () => {
      try {
          const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
          if (result.canceled) return;
          
          const file = result.assets[0];
          let csvText = "";

          // Depending on platform, reading the file differs
          if (Platform.OS === 'web') {
              const res = await fetch(file.uri);
              csvText = await res.text();
          } else {
              csvText = await FileSystem.readAsStringAsync(file.uri);
          }

          Papa.parse(csvText, {
              header: true,
              skipEmptyLines: true,
              complete: async (results) => {
                  const parsedData = results.data;
                  if (parsedData.length === 0) return universalAlert('Error', 'Empty CSV', []);
                  
                  try {
                      await bulkImportCustomers(parsedData);
                      universalAlert('Success', `${parsedData.length} customers imported!`, []);
                      loadCustomers(); // reload
                  } catch (e) {
                      universalAlert('Error', 'Failed to import to DB', []);
                  }
              },
              error: (err) => {
                  universalAlert('Parse Error', err.message, []);
              }
          });
      } catch (error) {
          universalAlert('Error', 'Failed to pick or read file.', []);
      }
  };

  if (loading) {
      return <ActivityIndicator size="large" color="#2e64e5" style={{flex: 1}} />
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity 
        style={styles.card}
        onPress={() => navigation.navigate('CustomerDetails', { customer: item })}
    >
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
              {item.photo_url ? (
                  <Image source={{uri: item.photo_url}} style={{width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee', marginRight: 15}} resizeMode="cover" />
              ) : (
                  <View style={{width: 50, height: 50, borderRadius: 25, backgroundColor: '#2e64e5', marginRight: 15, justifyContent: 'center', alignItems: 'center'}}>
                      <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 18}}>{item.name.charAt(0)}</Text>
                  </View>
              )}
              <View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.phone}>{item.phone}</Text>
                  {item.book_number ? <Text style={{fontSize: 12, color: '#888', marginTop: 2}}>Book: {item.book_number}</Text> : null}
              </View>
          </View>
          <View style={[styles.badge, item.latest_loan_status === 'DEFAULTER' ? {backgroundColor: '#e74c3c'} : {backgroundColor: '#2ecc71'}]}>
              <Text style={styles.badgeText}>{item.latest_loan_status || 'ACTIVE'}</Text>
          </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
          <TextInput 
              style={styles.searchInput}
              placeholder="Search by Name, Phone, Book ID, or Vehicle..."
              value={searchQuery}
              onChangeText={handleSearch}
          />
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
              <Text style={{color: '#888', alignSelf: 'center'}}>{filteredCustomers.length} found</Text>
              <TouchableOpacity style={{backgroundColor: '#e67e22', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 5}} onPress={handleBulkImport}>
                  <Text style={{color: '#fff', fontWeight: 'bold'}}>📥 Import CSV</Text>
              </TouchableOpacity>
          </View>
      </View>
      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.emptyText}>No customers found.</Text>}
      />
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => navigation.navigate('AddFinance')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  searchContainer: { padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  searchInput: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 8, fontSize: 16 },
  card: { backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginTop: 15, borderRadius: 8, elevation: 2 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  phone: { fontSize: 14, color: '#666', marginTop: 5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888', fontSize: 16 },
  fab: {
    position: 'absolute',
    width: 60, height: 60,
    alignItems: 'center', justifyContent: 'center',
    right: 20, bottom: 20,
    backgroundColor: '#2e64e5',
    borderRadius: 30,
    elevation: 5,
  },
  fabIcon: { fontSize: 30, color: 'white' }
});
