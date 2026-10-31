import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { addCustomer, createLoan, api } from '../api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { addDays, format } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { universalAlert } from '../utils';

export default function AddFinanceScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  
  // If we receive an existing customer, skip step 1
  const existingCustomer = route.params?.existingCustomer;
  
  const [step, setStep] = useState(existingCustomer ? 2 : 1);
  
  // Customer Data
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [bookNumber, setBookNumber] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');

  // Loan Data
  const [financeType, setFinanceType] = useState('TWO_WHEELER');
  const [allowedFinanceTypes, setAllowedFinanceTypes] = useState(['TWO_WHEELER','FOUR_WHEELER','THREE_WHEELER','COMMERCIAL_VEHICLE','GOLD_LOAN','SILVER_LOAN','PERSONAL_LOAN','HOME_LOAN','MORTGAGE','PROPERTY_LOAN','BUSINESS_LOAN','EDUCATION_LOAN','AGRICULTURE_LOAN','UDHAR','GIRVI','INSURANCE','OTHER']);
  useEffect(() => { api.get('/manage/features').then(r => { const list=r.data?.allowed_features || []; if(list.length){setAllowedFinanceTypes(list);setFinanceType(current=>list.includes(current)?current:list[0]);} }).catch(() => {}); }, []);
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleRegNumber, setVehicleRegNumber] = useState('');
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [collateralName, setCollateralName] = useState('');
  const [collateralWeight, setCollateralWeight] = useState('');
  const [collateralUnit, setCollateralUnit] = useState('GM');
  const [collateralPhotoUrl, setCollateralPhotoUrl] = useState('');
  const [totalFinance, setTotalFinance] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [totalInstallments, setTotalInstallments] = useState('');
  const [lateFeePerDay, setLateFeePerDay] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [startDateObj, setStartDateObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [intervalValue, setIntervalValue] = useState('1'); 
  const [intervalType, setIntervalType] = useState('Months'); // 'Days', 'Months', 'Years'
  const [installments, setInstallments] = useState([]);

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setStartDateObj(selectedDate);
  };

  const handlePhoneChange = (val, setter) => {
    let clean = val.replace(/[^\d+]/g, '');
    if (clean.length > 0 && !clean.startsWith('+91') && !clean.startsWith('+')) {
      if (clean.length === 10) {
        clean = '+91' + clean;
      }
    }
    setter(clean);
  };

  const handleTextOnlyChange = (val, setter) => {
    let clean = val.replace(/[^a-zA-Z\s]/g, '');
    setter(clean);
  };

  const handleDigitOnlyChange = (val, setter) => {
    let clean = val.replace(/[^\d.]/g, '');
    setter(clean);
  };

  const pickImage = async (setter) => {
      let result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.2, // Keep it small (<50kb usually)
          base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
          const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
          setter(base64Img);
      }
  };

  const handleGenerateInstallments = () => {
    if (!totalFinance || (!installmentAmount && !totalInstallments)) {
      return universalAlert('Error', 'Please fill all finance details.', []);
    }

    const total = parseFloat(totalFinance);
    let instAmt = parseFloat(installmentAmount);
    let totalInstCount = parseInt(totalInstallments, 10);
    
    if (instAmt > 0 && !totalInstCount) {
        totalInstCount = Math.ceil(total / instAmt);
    } else if (totalInstCount > 0 && !instAmt) {
        instAmt = total / totalInstCount;
    } else if (!instAmt && !totalInstCount) {
        return universalAlert('Error', 'Provide Installment Amount or Number of Installments', []);
    }

    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(instAmt) || instAmt <= 0 || !Number.isInteger(totalInstCount) || totalInstCount < 1 || totalInstCount > 600) {
      return universalAlert('Invalid Kist schedule', 'Enter a positive finance amount and a valid Kist amount or count (maximum 600 Kist).', []);
    }
    const finalInstallment = Number((total - instAmt * (totalInstCount - 1)).toFixed(2));
    if (finalInstallment <= 0) {
      return universalAlert('Kist total does not match', 'The Kist amount and count exceed the finance amount. Reduce the Kist amount or count.', []);
    }

    setInstallmentAmount(String(instAmt));
    setTotalInstallments(String(totalInstCount));
    let generated = [];
    let currentDate = new Date(startDateObj);
    const valToAdd = parseInt(intervalValue, 10) || 1;

    for (let i = 0; i < totalInstCount; i++) {
        const amountForThisInst = i === totalInstCount - 1 ? finalInstallment : instAmt;
        generated.push({
            id: i.toString(),
            amount: amountForThisInst,
            due_date: format(currentDate, 'yyyy-MM-dd')
        });

        // Intelligent date addition
        if (intervalType === 'Days') {
            currentDate = addDays(currentDate, valToAdd);
        } else if (intervalType === 'Months') {
            currentDate.setMonth(currentDate.getMonth() + valToAdd);
        } else if (intervalType === 'Years') {
            currentDate.setFullYear(currentDate.getFullYear() + valToAdd);
        }
    }
    setInstallments(generated);
    setStep(3);
  };

  const updateCustomDate = (index, newDate) => {
      const newInst = [...installments];
      newInst[index].due_date = newDate;
      setInstallments(newInst);
  };

  const updateCustomAmount = (index, newAmount) => {
      const newInst = [...installments];
      newInst[index].amount = parseFloat(newAmount) || 0;
      setInstallments(newInst);
  };

  const addManualRow = () => {
      setInstallments([...installments, {
          id: Math.random().toString(),
          amount: 0,
          due_date: format(new Date(), 'yyyy-MM-dd')
      }]);
  };

  const removeRow = (index) => {
      const newInst = [...installments];
      newInst.splice(index, 1);
      setInstallments(newInst);
  };

  const handleSaveCustomerOnly = async () => {
      if (!name || !phone) return universalAlert('Error', 'Name and Phone required', []);
      try {
          await addCustomer({ 
              name, phone, alternate_phone: alternatePhone, 
              unique_id: uniqueId, book_number: bookNumber, address, photo_url: photoUrl, notes 
          });
          universalAlert('Success', 'Customer profile created successfully!', [
              { text: 'OK', onPress: () => navigation.navigate('Customers') }
          ]);
      } catch (error) {
          console.error(error);
          universalAlert('Error', 'Failed to save customer.', []);
      }
  };

  const handleSave = async () => {
    try {
      let customerId;

      if (existingCustomer) {
          customerId = existingCustomer.id;
      } else {
          // 1. Create Customer
          const custRes = await addCustomer({ 
              name, phone, alternate_phone: alternatePhone, 
              unique_id: uniqueId, book_number: bookNumber, address, photo_url: photoUrl, notes 
          });
          customerId = custRes.data.id;
      }

      // 2. Create Loan & Installments
      await createLoan({
          customer_id: customerId,
          finance_type: financeType,
          vehicle_name: vehicleName,
          vehicle_reg_number: vehicleRegNumber,
          vehicle_photo_url: vehiclePhotoUrl,
          vendor_name: vendorName,
          insurance_company: insuranceCompany,
          collateral_name: collateralName,
          collateral_weight: parseFloat(collateralWeight) || null,
          collateral_weight_unit: collateralUnit,
          collateral_photo_url: collateralPhotoUrl,
          total_finance_amount: parseFloat(totalFinance),
          total_installments: installments.length,
          installment_amount: parseFloat(installmentAmount),
          late_fee_per_day: parseFloat(lateFeePerDay) || 0,
          guarantor_name: guarantorName,
          guarantor_phone: guarantorPhone,
          installments: installments.map(i => ({ amount: i.amount, due_date: i.due_date }))
      });

      universalAlert('Success', 'Customer and Finance added successfully!', []);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      universalAlert('Error', 'Failed to save data. Check console.', []);
    }
  };

  return (
    <ScrollView 
        style={styles.container} 
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
    >
      {step === 1 && (
        <View style={styles.section}>
          <Text style={styles.header}>Customer Details</Text>
          <TextInput style={styles.input} placeholder="Name *" value={name} onChangeText={(v) => handleTextOnlyChange(v, setName)} />
          <TextInput style={styles.input} placeholder="Phone *" value={phone} onChangeText={(v) => handlePhoneChange(v, setPhone)} keyboardType="phone-pad" />
          {phone.length > 0 && phone.length < 10 && <Text style={{color: 'red', fontSize: 10, marginTop: -10, marginBottom: 10}}>Enter a valid 10-digit number</Text>}
          <TextInput style={styles.input} placeholder="Alternate Phone (optional)" value={alternatePhone} onChangeText={(v) => handlePhoneChange(v, setAlternatePhone)} keyboardType="phone-pad" />
          <TextInput style={styles.input} placeholder="Unique ID (Aadhar/PAN)" value={uniqueId} onChangeText={setUniqueId} />
          <TextInput style={styles.input} placeholder="Book Number (Offline ID)" value={bookNumber} onChangeText={setBookNumber} />
          <TextInput style={styles.input} placeholder="Address" value={address} onChangeText={setAddress} multiline />
          
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
              <TouchableOpacity style={[styles.btn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={() => pickImage(setPhotoUrl)}>
                  <Text style={styles.btnText}>📷 Upload Photo</Text>
              </TouchableOpacity>
              {photoUrl ? <Text style={{color: '#2ecc71', fontWeight: 'bold'}}>✓ Selected</Text> : <Text style={{color: '#888'}}>No Photo</Text>}
          </View>
          
          <TextInput style={styles.input} placeholder="Notes" value={notes} onChangeText={setNotes} multiline />
          
          <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={[styles.btn, {backgroundColor: '#2ecc71', flex: 1}]} onPress={handleSaveCustomerOnly}>
                  <Text style={styles.btnText}>Save Customer Only</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.btn, {flex: 1}]} onPress={() => {
                  if(!name || !phone) return universalAlert('Error', 'Name and Phone required', []);
                  setStep(2);
              }}>
                  <Text style={styles.btnText}>Next: Add Finance</Text>
              </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={styles.section}>
          <Text style={styles.header}>Finance Details</Text>
          
          <Text style={styles.label}>Finance Type</Text>
          <View style={{flexDirection: 'row', gap: 5, marginBottom: 15, flexWrap: 'wrap'}}>
              {allowedFinanceTypes.map(type => (
                  <TouchableOpacity key={type} style={[styles.typeBtn, financeType === type && styles.typeBtnActive]} onPress={() => setFinanceType(type)}>
                      <Text style={[styles.typeBtnText, financeType === type && {color: '#fff'}]}>{type.replace('_', ' ')}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {(['TWO_WHEELER','FOUR_WHEELER','THREE_WHEELER','COMMERCIAL_VEHICLE'].includes(financeType)) && (
              <>
                  <Text style={styles.label}>Vehicle Details</Text>
                  <TextInput style={styles.input} placeholder="Vehicle Name" value={vehicleName} onChangeText={setVehicleName} />
                  <TextInput style={styles.input} placeholder="Vehicle Reg Number (e.g. MH01AB1234)" value={vehicleRegNumber} onChangeText={setVehicleRegNumber} autoCapitalize="characters" />
                  <TextInput style={styles.input} placeholder="Vendor/Showroom Name" value={vendorName} onChangeText={(v) => handleTextOnlyChange(v, setVendorName)} />
                  <TextInput style={styles.input} placeholder="Insurance Company" value={insuranceCompany} onChangeText={setInsuranceCompany} />
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
                      <TouchableOpacity style={[styles.btn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={() => pickImage(setVehiclePhotoUrl)}>
                          <Text style={styles.btnText}>📷 Upload Vehicle Photo</Text>
                      </TouchableOpacity>
                      {vehiclePhotoUrl ? <Text style={{color: '#2ecc71', fontWeight: 'bold'}}>✓ Selected</Text> : <Text style={{color: '#888'}}>No Photo</Text>}
                  </View>
              </>
          )}

          {(['GIRVI','GOLD_LOAN','SILVER_LOAN'].includes(financeType)) && (
              <>
                  <Text style={styles.label}>Girvi (Jewelry/Collateral) Details</Text>
                  <TextInput style={styles.input} placeholder="Item Name (e.g. Gold Chain, iPhone)" value={collateralName} onChangeText={setCollateralName} />
                  <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                      <TextInput style={[styles.input, {flex: 1, marginBottom: 0}]} placeholder="Weight/Value" value={collateralWeight} onChangeText={(v) => handleDigitOnlyChange(v, setCollateralWeight)} keyboardType="numeric" />
                      <TouchableOpacity style={[styles.btn, collateralUnit === 'GM' ? styles.btnOutline : {}, {padding: 10, flex: 0}]} onPress={() => setCollateralUnit('GM')}>
                          <Text style={collateralUnit === 'GM' ? styles.btnOutlineText : styles.btnText}>GM</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, collateralUnit === 'KG' ? styles.btnOutline : {}, {padding: 10, flex: 0}]} onPress={() => setCollateralUnit('KG')}>
                          <Text style={collateralUnit === 'KG' ? styles.btnOutlineText : styles.btnText}>KG</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, collateralUnit === 'CARAT' ? styles.btnOutline : {}, {padding: 10, flex: 0}]} onPress={() => setCollateralUnit('CARAT')}>
                          <Text style={collateralUnit === 'CARAT' ? styles.btnOutlineText : styles.btnText}>CRT</Text>
                      </TouchableOpacity>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
                      <TouchableOpacity style={[styles.btn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={() => pickImage(setCollateralPhotoUrl)}>
                          <Text style={styles.btnText}>📷 Upload Item Photo</Text>
                      </TouchableOpacity>
                      {collateralPhotoUrl ? <Text style={{color: '#2ecc71', fontWeight: 'bold'}}>✓ Selected</Text> : <Text style={{color: '#888'}}>No Photo</Text>}
                  </View>
              </>
          )}

          {(['HOME_LOAN','MORTGAGE','PROPERTY_LOAN'].includes(financeType)) && (
              <>
                  <Text style={styles.label}>Property Details</Text>
                  <TextInput style={styles.input} placeholder="Property Type & Name" value={collateralName} onChangeText={setCollateralName} />
              </>
          )}

          <Text style={styles.label}>Finance Calculation</Text>
          <TextInput style={styles.input} placeholder="Total Finance Amount" value={totalFinance} onChangeText={setTotalFinance} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Number of Installments (optional)" value={totalInstallments} onChangeText={setTotalInstallments} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Installment Amount (optional)" value={installmentAmount} onChangeText={setInstallmentAmount} keyboardType="numeric" />
          
          <Text style={styles.label}>Advanced Options</Text>
          <TextInput style={styles.input} placeholder="Late Fee Per Day (₹) [optional]" value={lateFeePerDay} onChangeText={setLateFeePerDay} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Guarantor Name (optional)" value={guarantorName} onChangeText={setGuarantorName} />
          <TextInput style={styles.input} placeholder="Guarantor Phone (optional)" value={guarantorPhone} onChangeText={setGuarantorPhone} keyboardType="phone-pad" />

          <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
          {Platform.OS === 'web' ? (
              <input 
                  style={{
                      borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16, width: '100%', boxSizing: 'border-box'
                  }} 
                  type="date"
                  value={format(startDateObj, 'yyyy-MM-dd')} 
                  onChange={(e) => {
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) setStartDateObj(d);
                  }} 
              />
          ) : (
              <>
                  <TouchableOpacity style={[styles.input, {justifyContent: 'center'}]} onPress={() => setShowDatePicker(true)}>
                      <Text>{format(startDateObj, 'yyyy-MM-dd')}</Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                      <DateTimePicker
                          value={startDateObj}
                          mode="date"
                          display="default"
                          onChange={onDateChange}
                      />
                  )}
              </>
          )}
          
          <Text style={styles.label}>Interval between installments</Text>
          <View style={{flexDirection: 'row', gap: 10}}>
              <TextInput 
                style={[styles.input, {flex: 1}]} 
                placeholder="Value (e.g. 1)" 
                value={intervalValue} 
                onChangeText={setIntervalValue} 
                keyboardType="numeric" 
              />
              <View style={{flexDirection: 'row', flex: 2, justifyContent: 'space-around'}}>
                  {['Days', 'Months', 'Years'].map(type => (
                      <TouchableOpacity 
                        key={type} 
                        style={[styles.typeBtn, intervalType === type && styles.typeBtnActive]}
                        onPress={() => setIntervalType(type)}
                      >
                          <Text style={[styles.typeBtnText, intervalType === type && {color: '#fff'}]}>{type}</Text>
                      </TouchableOpacity>
                  ))}
              </View>
          </View>

          <View style={styles.row}>
            {!existingCustomer && (
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setStep(1)}>
                    <Text style={styles.btnOutlineText}>Back</Text>
                </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btn} onPress={handleGenerateInstallments}>
                <Text style={styles.btnText}>Preview Installments</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 3 && (
        <View style={styles.section}>
          <Text style={styles.header}>Verify Installments</Text>
          <Text style={styles.subText}>You can manually edit amounts and dates.</Text>
          
          {installments.map((inst, index) => (
              <View key={inst.id} style={styles.instRow}>
                  <Text style={styles.instNum}>#{index + 1}</Text>
                  <TextInput 
                      style={[styles.instDateInput, {flex: 1, marginRight: 5}]}
                      value={inst.amount.toString()}
                      keyboardType="numeric"
                      onChangeText={(text) => updateCustomAmount(index, text)}
                  />
                  <TextInput 
                      style={styles.instDateInput}
                      value={inst.due_date}
                      onChangeText={(text) => updateCustomDate(index, text)}
                  />
                  <TouchableOpacity onPress={() => removeRow(index)} style={{marginLeft: 10}}>
                      <Text style={{color: 'red', fontWeight: 'bold'}}>X</Text>
                  </TouchableOpacity>
              </View>
          ))}

          <TouchableOpacity style={[styles.btn, styles.btnOutline, {marginBottom: 20}]} onPress={addManualRow}>
              <Text style={styles.btnOutlineText}>+ Add Manual Row</Text>
          </TouchableOpacity>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setStep(2)}>
                <Text style={styles.btnOutlineText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, {backgroundColor: '#2ecc71'}]} onPress={handleSave}>
                <Text style={styles.btnText}>Save Finance</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  section: { padding: 20 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  label: { fontSize: 14, color: '#666', marginTop: 10, marginBottom: 5 },
  subText: { fontSize: 13, color: '#888', marginBottom: 15 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  btn: { backgroundColor: '#2e64e5', padding: 15, borderRadius: 8, alignItems: 'center', flex: 1, marginHorizontal: 5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2e64e5' },
  btnOutlineText: { color: '#2e64e5', fontSize: 16, fontWeight: '600' },
  typeBtn: { padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, justifyContent: 'center' },
  typeBtnActive: { backgroundColor: '#2e64e5', borderColor: '#2e64e5' },
  typeBtnText: { color: '#555' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  instRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  instNum: { width: 40, fontWeight: 'bold', color: '#555' },
  instAmt: { flex: 1, fontSize: 16, color: '#333' },
  instDateInput: { borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 5, width: 120, textAlign: 'center' }
});
