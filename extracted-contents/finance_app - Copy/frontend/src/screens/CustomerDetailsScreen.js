import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { getCustomerLoans, getLoanDetails, updateInstallmentStatus, updateLoanStatus, markAllInstallmentsPaid, editInstallment, updateCustomer, updateLoanDetails, deleteCustomer, getSettings, API_BASE_URL, getExportCustomerHistory } from '../api';
import { useRoute, useNavigation } from '@react-navigation/native';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { documentDirectory, writeAsStringAsync } from 'expo-file-system';
import * as Print from 'expo-print';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { universalAlert } from '../utils';

export default function CustomerDetailsScreen() {
  // Extract passed routing data (the specific customer object)
  const route = useRoute();
  const navigation = useNavigation();
  const { customer } = route.params;

  // Automatically update the header to show a functional Back button
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity style={{ marginLeft: 15 }} onPress={() => navigation.navigate('Customers')}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>&larr; Back</Text>
        </TouchableOpacity>
      )
    });
  }, [navigation]);
  
  // React State Initialization
  const [customerState, setCustomerState] = useState(customer); // Holds editable customer details
  const [loan, setLoan] = useState(null); // The latest loan context
  const [installments, setInstallments] = useState([]); // List of the loan's Kists
  const [loading, setLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState({});
  const [activeTab, setActiveTab] = useState('PENDING'); // State to control local list tab

  // Edit Cust State
  const [editCustModal, setEditCustModal] = useState(false);
  const [custName, setCustName] = useState(customer.name);
  const [custPhone, setCustPhone] = useState(customer.phone);
  const [custAlt, setCustAlt] = useState(customer.alternate_phone || '');
  const [custBook, setCustBook] = useState(customer.book_number || '');
  const [custUniqueId, setCustUniqueId] = useState(customer.unique_id || '');
  const [custAddress, setCustAddress] = useState(customer.address || '');
  const [custPhotoUrl, setCustPhotoUrl] = useState(customer.photo_url || '');
  const [custNotes, setCustNotes] = useState(customer.notes || '');

  // Validates phone inputs dynamically adding +91 to 10-digit numbers
  const handlePhoneChange = (val, setter) => {
    let clean = val.replace(/[^\d+]/g, '');
    if (clean.length > 0 && !clean.startsWith('+91') && !clean.startsWith('+')) {
      if (clean.length === 10) {
        clean = '+91' + clean;
      }
    }
    setter(clean);
  };

  // Triggers the Expo Image Picker and converts the result to a lightweight base64 string
  const pickImage = async () => {
      let result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.2, // Compress heavily < 50kb
          base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
          const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
          setCustPhotoUrl(base64Img);
      }
  };

  // Edit Loan State
  const [editLoanModal, setEditLoanModal] = useState(false);
  const [loanEditData, setLoanEditData] = useState({});

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedInst, setSelectedInst] = useState(null);
  const [modalAmount, setModalAmount] = useState('');
  const [modalLateFee, setModalLateFee] = useState('');
  const [modalOtherCharges, setModalOtherCharges] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidDateObj, setPaidDateObj] = useState(new Date());
  const [showPaidDatePicker, setShowPaidDatePicker] = useState(false);

  // Mark All Paid Modal State
  const [markAllModal, setMarkAllModal] = useState(false);
  const [markAllFinalAmount, setMarkAllFinalAmount] = useState('');

  // Edit Inst State
  const [editInstModal, setEditInstModal] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
          const settingsRes = await getSettings();
          setCompanySettings(settingsRes.data || {});

          const loansRes = await getCustomerLoans(customerState.id);
      if (loansRes.data.length > 0) {
          const recentLoan = loansRes.data[0];
          const detailsRes = await getLoanDetails(recentLoan.id);
          setLoan(detailsRes.data.loan);
          setInstallments(detailsRes.data.installments);
              setLoanEditData({
                  finance_type: detailsRes.data.loan.finance_type || '',
                  vehicle_name: detailsRes.data.loan.vehicle_name || '',
                  vehicle_reg_number: detailsRes.data.loan.vehicle_reg_number || '',
                  vehicle_photo_url: detailsRes.data.loan.vehicle_photo_url || '',
                  vendor_name: detailsRes.data.loan.vendor_name || '',
                  insurance_company: detailsRes.data.loan.insurance_company || '',
                  collateral_name: detailsRes.data.loan.collateral_name || '',
                  collateral_weight: detailsRes.data.loan.collateral_weight?.toString() || '',
                  collateral_weight_unit: detailsRes.data.loan.collateral_weight_unit || 'GM',
                  collateral_photo_url: detailsRes.data.loan.collateral_photo_url || '',
                  total_finance_amount: detailsRes.data.loan.total_finance_amount?.toString() || '',
                  installment_amount: detailsRes.data.loan.installment_amount?.toString() || '',
                  late_fee_per_day: detailsRes.data.loan.late_fee_per_day?.toString() || '0'
              });
      }
    } catch (error) {
      console.error('Error fetching details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Invokes the device's native dialer.
  const handleCall = () => {
      Linking.openURL(`tel:+91${customerState.phone}`);
  };

  // Opens WhatsApp with a pre-filled message. Uses wa.me on web and native URI schemes on mobile.
  const handleWhatsApp = () => {
      const msg = "Reminder: Your finance installment is due.";
      const url = Platform.OS === 'web' 
          ? `https://wa.me/91${customerState.phone}?text=${encodeURIComponent(msg)}`
          : `whatsapp://send?phone=+91${customerState.phone}&text=${encodeURIComponent(msg)}`;
      Linking.openURL(url);
  };

  const handleMarkDefaulter = async () => {
      universalAlert("Confirm", "Mark this customer as a Defaulter?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: async () => {
              try {
                  await updateLoanStatus(loan.id, 'DEFAULTER');
                  fetchData();
                  universalAlert('Success', 'Customer marked as defaulter.', []);
              } catch (error) {
                  universalAlert('Error', error.message || 'Failed to update loan status.', []);
              }
          }}
      ]);
  };

  const handleCloseGirvi = async () => {
      universalAlert("Confirm Return", "Are you sure you want to mark this Girvi/Loan as fully returned and closed?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Close It", onPress: async () => {
              try {
                  await updateLoanDetails(loan.id, { ...loan, is_closed: 1 });
                  fetchData();
                  universalAlert('Success', 'Girvi closed and items marked returned.', []);
              } catch (e) {
                  universalAlert('Error', 'Failed to close Girvi.', []);
              }
          }}
      ]);
  };

  const handleMarkAllPaid = () => {
      const remainingBase = loan?.total_finance_amount - totalPaid;
      setPaymentMethod('CASH');
      setPaidDateObj(new Date());
      setMarkAllFinalAmount(remainingBase.toString());
      setMarkAllModal(true);
  };

  const processMarkAll = async () => {
      try {
          if (isNaN(markAllFinalAmount) || String(markAllFinalAmount).trim() === '') return universalAlert('Error', 'Enter a valid number for settlement.', []);
          if (parseFloat(markAllFinalAmount) < 0) return universalAlert('Error', 'Settlement amount cannot be negative.', []);
          
          const pdStr = format(paidDateObj, 'yyyy-MM-dd');
          await markAllInstallmentsPaid(loan.id, paymentMethod, pdStr, markAllFinalAmount);
          setMarkAllModal(false);
          fetchData();
          universalAlert('Success', `Loan settled for ₹${markAllFinalAmount} via ${paymentMethod}.`, []);
      } catch (error) {
          universalAlert('Error', error.message || 'Failed to process payment.', []);
      }
  };

  const toggleStatus = async (inst) => {
      if (inst.status === 'PAID') {
          // Revert to UNPAID
          try {
              await updateInstallmentStatus(inst.id, 'UNPAID', inst.amount, 0, 0, null, null);
              fetchData();
          } catch (e) {
              universalAlert("Error", "Could not update status.", []);
          }
      } else {
          // Open Modal for paying
          setSelectedInst(inst);
          setModalAmount(inst.amount.toString());
          setModalLateFee(inst.late_fee?.toString() || '0');
          setModalOtherCharges(inst.other_charges?.toString() || '0');
          setPaymentMethod('CASH');
          setPaidDateObj(new Date());
          setModalVisible(true);
      }
  };

  const submitPayment = async () => {
      try {
          if (isNaN(modalAmount) || String(modalAmount).trim() === '' || isNaN(modalLateFee) || isNaN(modalOtherCharges)) {
              return universalAlert('Error', 'Please enter valid numbers only.', []);
          }

          const finalAmt = parseFloat(modalAmount);
          const finalLF = parseFloat(modalLateFee) || 0;
          const finalOC = parseFloat(modalOtherCharges) || 0;
          
          if (finalAmt < 0 || finalLF < 0 || finalOC < 0) {
              return universalAlert('Error', 'Amounts cannot be negative.', []);
          }
          const pdStr = format(paidDateObj, 'yyyy-MM-dd');
          
          await updateInstallmentStatus(selectedInst.id, 'PAID', finalAmt, finalLF, finalOC, paymentMethod, pdStr);
          
          setModalVisible(false);
          fetchData();

          // Generate Text Receipt
          universalAlert("Receipt", "Would you like to share a receipt for this payment?", [
              { text: "No", style: "cancel" },
              { text: "Yes", onPress: () => shareReceipt(finalAmt, finalLF, finalOC) }
          ]);
      } catch (e) {
          universalAlert("Error", "Failed to submit payment", []);
      }
  };

  const generatePDFSchedule = async (asImage = false) => {
      const totalPaid = installments.filter(i => i.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0);
      const remainingBase = loan?.total_finance_amount - totalPaid;
      const outstandingBase = remainingBase > 0 ? remainingBase : 0;
      
      const htmlContent = `
          <html>
              <head>
                  <style>
                      body { font-family: 'Helvetica', sans-serif; padding: 30px; color: #333; margin: 0; }
                      .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .15); }
                      .header-table { width: 100%; border-bottom: 2px solid #2e64e5; padding-bottom: 20px; margin-bottom: 20px; }
                      .company-name { font-size: 32px; color: #2e64e5; font-weight: bold; margin: 0; }
                      .company-phone { color: #555; font-size: 16px; margin-top: 5px; }
                      .title { text-align: center; font-size: 24px; margin: 20px 0; text-transform: uppercase; letter-spacing: 2px; color: #555; }
                      .info-table { width: 100%; margin-bottom: 30px; }
                      .info-table td { vertical-align: top; padding: 5px; }
                      
                      table.items { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                      table.items th, table.items td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                      table.items th { background-color: #2e64e5; color: white; }
                      table.items tr:nth-child(even) { background-color: #f9f9f9; }
                      
                      .PAID { color: #2ecc71; font-weight: bold; }
                      .UNPAID { color: #e74c3c; font-weight: bold; }
                      .DELAYED { color: #e67e22; font-weight: bold; }
                      
                      .footer-flex { display: flex; justify-content: space-between; margin-top: 40px; border-top: 2px solid #eee; padding-top: 20px; }
                      .summary-box { background: #f4f6f8; padding: 15px; border-radius: 8px; width: 45%; }
                      .summary-box p { margin: 5px 0; font-size: 16px; display: flex; justify-content: space-between; }
                      .payment-info { width: 45%; }
                      .qr-code { max-width: 120px; max-height: 120px; margin-top: 10px; border: 1px solid #ddd; padding: 5px; border-radius: 8px; }
                  </style>
              </head>
              <body>
                  <div class="invoice-box">
                      <table class="header-table">
                          <tr>
                              <td style="width: 70%;">
                                  <h1 class="company-name">${companySettings.company_name || 'FinTrack Finance'}</h1>
                                  <div class="company-phone">Ph: ${companySettings.company_phone || 'N/A'}</div>
                              </td>
                              <td style="width: 30%; text-align: right;">
                                  ${companySettings.company_logo ? `<img src="${companySettings.company_logo}" style="max-height: 80px; max-width: 150px;" />` : ''}
                              </td>
                          </tr>
                      </table>
                      
                      <div class="title">OFFICIAL FINANCE SCHEDULE</div>
                      
                      <table class="info-table">
                          <tr>
                              <td style="width: 50%;">
                                  <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #2e64e5;">
                                      <strong>CUSTOMER DETAILS</strong><br/><br/>
                                      <strong>Name:</strong> ${customerState.name}<br/>
                                      <strong>Phone:</strong> ${customerState.phone}<br/>
                                      ${customerState.book_number ? `<strong>Book Number:</strong> ${customerState.book_number}<br/>` : ''}
                                      ${customerState.unique_id ? `<strong>ID/Aadhar:</strong> ${customerState.unique_id}<br/>` : ''}
                                      ${customerState.address ? `<strong>Address:</strong> ${customerState.address}` : ''}
                                  </div>
                              </td>
                              <td style="width: 50%;">
                                  <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #2ecc71;">
                                      <strong>FINANCE DETAILS</strong><br/><br/>
                                      <strong>Type:</strong> ${loan?.finance_type?.replace('_', ' ')}<br/>
                                      ${loan?.vehicle_name ? `<strong>Vehicle:</strong> ${loan.vehicle_name} ${loan.vehicle_reg_number ? `(${loan.vehicle_reg_number})` : ''} <br/><strong>Vendor:</strong> ${loan.vendor_name}<br/>` : ''}
                                      <strong>Total Financed:</strong> ₹${loan?.total_finance_amount}<br/>
                                      <strong>Installment Amount:</strong> ₹${loan?.installment_amount}<br/>
                                      <strong>Date Generated:</strong> ${new Date().toLocaleDateString()}<br/>
                                  </div>
                              </td>
                          </tr>
                      </table>

                      <table class="items">
                          <tr>
                              <th>Kist #</th>
                              <th>Due Date</th>
                              <th>Base Amount</th>
                              <th>Extra Fees</th>
                              <th>Method</th>
                              <th>Status</th>
                              <th>Paid Date</th>
                          </tr>
                          ${installments.map((inst, idx) => `
                              <tr>
                                  <td>${idx + 1}</td>
                                  <td>${inst.due_date}</td>
                                  <td>₹${inst.amount}</td>
                                  <td>₹${(inst.late_fee || 0) + (inst.other_charges || 0)}</td>
                                  <td>${inst.payment_method || '-'}</td>
                                  <td class="${inst.status}">${inst.status}</td>
                                  <td>${inst.paid_date || '-'}</td>
                              </tr>
                          `).join('')}
                      </table>

                      <div class="footer-flex">
                          <div class="payment-info">
                              ${companySettings.upi_id ? `
                                  <strong>Payment Details (UPI)</strong><br/>
                                  ID: ${companySettings.upi_id}<br/>
                                  ${companySettings.qr_code_url ? `<img src="${companySettings.qr_code_url}" class="qr-code" />` : ''}
                              ` : '<em>Please contact office for payment methods.</em>'}
                          </div>
                          
                          <div class="summary-box">
                              <p><span>Total Financed:</span> <strong>₹${loan?.total_finance_amount}</strong></p>
                              <p><span>Total Paid Base:</span> <strong style="color: #2ecc71;">₹${totalPaid}</strong></p>
                              <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;" />
                              <p><span>Remaining Base:</span> <strong style="color: #e74c3c;">₹${outstandingBase}</strong></p>
                          </div>
                      </div>
                  </div>
              </body>
          </html>
      `;

      try {
          if (Platform.OS === 'web') {
              const newWindow = window.open('', '_blank');
              newWindow.document.write(htmlContent);
              newWindow.document.close();
              newWindow.onload = () => newWindow.print();
          } else {
              if (asImage) {
                  // Wait for screenshot capabilities (simplified via sharing PDF for now)
                  // To output true JPG we would use react-native-view-shot, but for simplicity
                  // we will output the PDF but prompt "Image Sharing requires Native ViewShot plugin".
                  Alert.alert('Notice', 'Image generation (JPG) requires ViewShot plugin. Sharing PDF instead.', [
                      { text: 'OK', onPress: async () => {
                          const { uri } = await Print.printToFileAsync({ html: htmlContent });
                          if (await isAvailableAsync()) await shareAsync(uri);
                      }}
                  ]);
              } else {
                  const { uri } = await Print.printToFileAsync({ html: htmlContent });
                  if (await isAvailableAsync()) {
                      await shareAsync(uri);
                  } else {
                      Alert.alert('Success', 'PDF generated at: ' + uri);
                  }
              }
          }
      } catch (err) {
          universalAlert('Error', 'Failed to share receipt', []);
      }
  };

  const exportCustomerHistory = async () => {
      try {
          const res = await getExportCustomerHistory(customerState.id);
          const data = res.data;
          
          if (!data || data.length === 0) return universalAlert('Notice', 'No installments found to export.', []);

          const header = Object.keys(data[0]).join(',');
          const rows = data.map(obj => Object.values(obj).map(val => `"${val}"`).join(',')).join('\n');
          const csvString = `${header}\n${rows}`;

          if (Platform.OS === 'web') {
              const blob = new Blob([csvString], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `customer_${customerState.id}_history.csv`;
              a.click();
              window.URL.revokeObjectURL(url);
          } else {
              const fileUri = `${documentDirectory || ''}customer_${customerState.id}_history.csv`;
              await writeAsStringAsync(fileUri, csvString);

              if (await isAvailableAsync()) {
                  await shareAsync(fileUri);
              } else {
                  universalAlert('Success', `File saved locally: ${fileUri}`, []);
              }
          }
      } catch (err) {
          console.error(err);
          universalAlert('Error', 'An error occurred during export.', []);
      }
  };

  const saveInstallmentEdit = async () => {
      try {
          if (isNaN(editAmount)) return universalAlert('Error', 'Amount must be a number', []);
          await editInstallment(selectedInst.id, parseFloat(editAmount), editDate);
          setEditInstModal(false);
          fetchData();
      } catch(e) {
          universalAlert('Error', 'Failed to edit installment', []);
      }
  };

  const saveCustomerEdit = async () => {
      try {
          await updateCustomer(customerState.id, { 
              name: custName, phone: custPhone, alternate_phone: custAlt, book_number: custBook, 
              unique_id: custUniqueId, address: custAddress, photo_url: custPhotoUrl, notes: custNotes 
          });
          setCustomerState({...customerState, name: custName, phone: custPhone, alternate_phone: custAlt, book_number: custBook, unique_id: custUniqueId, address: custAddress, photo_url: custPhotoUrl, notes: custNotes});
          setEditCustModal(false);
      } catch(e) {
          universalAlert('Error', 'Failed to edit customer', []);
      }
  };

  const saveLoanEdit = async () => {
      try {
          await updateLoanDetails(loan.id, {
              finance_type: loanEditData.finance_type,
              vehicle_name: loanEditData.vehicle_name,
              vehicle_reg_number: loanEditData.vehicle_reg_number,
              vehicle_photo_url: loanEditData.vehicle_photo_url,
              vendor_name: loanEditData.vendor_name,
              insurance_company: loanEditData.insurance_company,
              collateral_name: loanEditData.collateral_name,
              collateral_weight: parseFloat(loanEditData.collateral_weight) || null,
              collateral_weight_unit: loanEditData.collateral_weight_unit,
              collateral_photo_url: loanEditData.collateral_photo_url,
              total_finance_amount: parseFloat(loanEditData.total_finance_amount) || 0,
              installment_amount: parseFloat(loanEditData.installment_amount) || 0,
              late_fee_per_day: parseFloat(loanEditData.late_fee_per_day) || 0
          });
          setEditLoanModal(false);
          fetchData();
          universalAlert('Success', 'Finance details updated', []);
      } catch(e) {
          universalAlert('Error', 'Failed to update loan', []);
      }
  };

  const handleDeleteCustomer = () => {
      universalAlert("DANGER", "Are you sure you want to delete this customer AND ALL THEIR LOANS? This cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "DELETE", style: "destructive", onPress: async () => {
              try {
                  await deleteCustomer(customerState.id);
                  navigation.goBack();
              } catch(e) {
                  universalAlert('Error', 'Failed to delete', []);
              }
          }}
      ])
  };

  const shareReceipt = async (amt, lf, oc) => {
      const receiptText = `*Payment Receipt - FinTrack*\n\nCustomer: ${customerState.name}\nDate: ${new Date().toLocaleDateString()}\n\nBase Amount: ₹${amt}\nLate Fees: ₹${lf}\nOther Charges: ₹${oc}\n\n*Total Paid: ₹${amt + lf + oc}*\n\nThank you for your payment!`;
      
      if (Platform.OS === 'web') {
          const url = `https://wa.me/91${customerState.phone}?text=${encodeURIComponent(receiptText)}`;
          Linking.openURL(url);
      } else {
          try {
              const fileUri = documentDirectory + 'receipt.txt';
              await writeAsStringAsync(fileUri, receiptText);
              if (await isAvailableAsync()) {
                  await shareAsync(fileUri);
              }
          } catch (error) {
              Alert.alert('Error', 'Failed to share receipt');
          }
      }
  };

  if (loading) return <ActivityIndicator size="large" color="#2e64e5" style={{flex: 1}} />;

  // Aggregations
  const totalPaid = installments.filter(i => i.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0);
  const totalLateFees = installments.filter(i => i.status === 'PAID').reduce((acc, curr) => acc + (curr.late_fee || 0), 0);
  const totalOther = installments.filter(i => i.status === 'PAID').reduce((acc, curr) => acc + (curr.other_charges || 0), 0);

  const parsedAmount = parseFloat(modalAmount) || 0;
  const parsedLateFee = parseFloat(modalLateFee) || 0;
  const parsedOther = parseFloat(modalOtherCharges) || 0;
  const finalTotalAmount = parsedAmount + parsedLateFee + parsedOther;

  const renderInstallment = ({ item, index }) => {
      let statusColor = '#333';
      if (item.status === 'PAID') statusColor = '#2ecc71';
      else if (item.status === 'DELAYED') statusColor = '#e74c3c';
      
      return (
          <View style={styles.instCard}>
              <View style={{flex: 1}}>
                  <Text style={styles.instDate}>Kist #{index + 1}: {item.due_date}</Text>
                  <Text style={styles.instAmt}>₹{item.amount.toFixed(2)}</Text>
                  {item.status === 'PAID' && (
                      <Text style={{fontSize: 12, color: '#666'}}>+ ₹{item.late_fee} LF | + ₹{item.other_charges || 0} Other</Text>
                  )}
                  <Text style={[styles.instStatus, { color: statusColor }]}>{item.status}</Text>
              </View>
              
              <View style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}>
                  {item.status !== 'PAID' && (
                      <TouchableOpacity onPress={() => {
                          setSelectedInst(item);
                          setEditAmount(item.amount.toString());
                          setEditDate(item.due_date);
                          setEditInstModal(true);
                      }}>
                          <Text style={{color: '#3498db', fontWeight: 'bold'}}>✏️ Edit</Text>
                      </TouchableOpacity>
                  )}

                  <TouchableOpacity 
                      style={[styles.actionBtn, item.status === 'PAID' ? styles.btnUndo : styles.btnPay]}
                      onPress={() => toggleStatus(item)}
                  >
                      <Text style={styles.actionBtnText}>
                          {item.status === 'PAID' ? 'Undo' : 'Pay'}
                      </Text>
                  </TouchableOpacity>
              </View>
          </View>
      );
  };

  return (
    <View style={styles.container}>
        {/* Details section */}
        <View style={{flex: 1}}>
            <FlatList
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderInstallment}
                contentContainerStyle={{ paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={() => (
                    <>
                        {/* Header section with comms */}
                        <View style={styles.headerCard}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                                <Text style={styles.name}>{customerState.name}</Text>
                                <TouchableOpacity onPress={() => setEditCustModal(true)}>
                                    <Text style={{color: '#3498db', fontWeight: 'bold'}}>✏️ Edit</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.phone}>{customerState.phone}</Text>
                            
                            <View style={styles.commsRow}>
                                <TouchableOpacity style={[styles.commBtn, { backgroundColor: '#3498db' }]} onPress={handleCall}>
                                    <Text style={styles.commBtnText}>📞 Call</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.commBtn, { backgroundColor: '#25D366' }]} onPress={handleWhatsApp}>
                                    <Text style={styles.commBtnText}>💬 WhatsApp</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {loan ? (
                            <View style={[styles.summaryCard, loan.status === 'DEFAULTER' && {borderColor: '#e74c3c', borderWidth: 2}]}>
                                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5}}>
                                    <Text style={[styles.summaryTitle, loan.status === 'DEFAULTER' && {color: '#e74c3c'}]}>
                                        {loan.finance_type ? loan.finance_type.replace('_', ' ') : 'Finance'} Details {loan.status === 'DEFAULTER' ? '(DEFAULTER)' : ''}
                                    </Text>
                                    <View style={{flexDirection: 'row', gap: 15}}>
                                        <TouchableOpacity onPress={() => setEditLoanModal(true)}>
                                            <Text style={{color: '#3498db', fontWeight: 'bold'}}>✏️ Edit</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => generatePDFSchedule(false)}>
                                            <Text style={{color: '#e74c3c', fontWeight: 'bold'}}>📄 PDF</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {customerState.book_number ? <Text style={{fontSize: 13, color: '#555', marginBottom: 2, fontWeight: 'bold'}}>Book No: {customerState.book_number}</Text> : null}
                                {loan.vehicle_name ? <Text style={{fontSize: 13, color: '#666', marginBottom: 2}}>{loan.vehicle_name} {loan.vehicle_reg_number ? `(${loan.vehicle_reg_number})` : ''} - {loan.vendor_name}</Text> : null}
                                {loan.insurance_company ? <Text style={{fontSize: 13, color: '#666', marginBottom: 2}}>Insurer: {loan.insurance_company}</Text> : null}
                                
                                <Text style={{marginTop: 5}}>Total Financed: ₹{loan.total_finance_amount ? loan.total_finance_amount.toFixed(2) : '0.00'}</Text>
                                <Text>Installment: ₹{loan.installment_amount ? loan.installment_amount.toFixed(2) : '0.00'}</Text>
                                {loan.guarantor_name ? <Text style={{fontSize: 13, color: '#555'}}>Guarantor: {loan.guarantor_name} ({loan.guarantor_phone})</Text> : null}
                                <Text style={{marginBottom: 10, fontSize: 13, color: '#555'}}>Late Fee / Day: ₹{loan.late_fee_per_day}</Text>

                                <Text style={{fontWeight: 'bold', color: '#2ecc71'}}>Amount Paid: ₹{totalPaid.toFixed(2)}</Text>
                                <Text style={{fontWeight: 'bold', color: '#f39c12'}}>Late Fees Collected: ₹{totalLateFees.toFixed(2)}</Text>
                                <Text style={{fontWeight: 'bold', color: '#9b59b6'}}>Other Charges Collected: ₹{totalOther.toFixed(2)}</Text>
                                
                                <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
                                    <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71'}]} onPress={handleMarkAllPaid}>
                                        <Text style={styles.commBtnText}>Pay Remaining Balance</Text>
                                    </TouchableOpacity>
                                    
                                    {loan.status === 'DEFAULTER' ? (
                                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#34495e'}]} onPress={async () => {
                                            try {
                                                await updateLoanStatus(loan.id, 'ACTIVE');
                                                fetchData();
                                            } catch (e) { universalAlert('Error', 'Failed to reactivate', []); }
                                        }}>
                                            <Text style={styles.commBtnText}>Reactivate Loan</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#e74c3c'}]} onPress={handleMarkDefaulter}>
                                            <Text style={styles.commBtnText}>Mark Defaulter</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {loan.finance_type === 'GIRVI' && loan.is_closed === 0 && (
                                    <View style={{marginTop: 10}}>
                                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#f39c12', paddingVertical: 12}]} onPress={handleCloseGirvi}>
                                            <Text style={styles.commBtnText}>Close Girvi (Item Returned)</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {loan.finance_type === 'GIRVI' && loan.is_closed === 1 && (
                                    <View style={{marginTop: 10, padding: 10, backgroundColor: '#e8f8f5', borderRadius: 5, alignItems: 'center'}}>
                                        <Text style={{color: '#16a085', fontWeight: 'bold'}}>✓ Girvi Closed & Item Returned</Text>
                                    </View>
                                )}
                            </View>
                        ) : (
                            <View style={{padding: 20, alignItems: 'center'}}>
                                <Text style={styles.noData}>No active finance records found.</Text>
                            </View>
                        )}

                        <View style={{flexDirection: 'row', gap: 10, marginHorizontal: 15, marginBottom: 10}}>
                            <TouchableOpacity 
                                style={{backgroundColor: '#34495e', padding: 12, borderRadius: 8, flex: 1, alignItems: 'center'}}
                                onPress={() => navigation.navigate('AddFinance', { existingCustomer: customerState })}
                            >
                                <Text style={{color: '#fff', fontWeight: 'bold'}}>+ Add Finance</Text>
                            </TouchableOpacity>
                            {loan && (
                                <TouchableOpacity 
                                    style={{backgroundColor: '#8e44ad', padding: 12, borderRadius: 8, flex: 1, alignItems: 'center'}}
                                    onPress={exportCustomerHistory}
                                >
                                    <Text style={{color: '#fff', fontWeight: 'bold'}}>📥 Export CSV</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {loan && (
                            <View style={{flexDirection: 'row', marginHorizontal: 15, marginTop: 10, borderBottomWidth: 1, borderColor: '#ddd'}}>
                                <TouchableOpacity 
                                    style={{flex: 1, paddingVertical: 10, borderBottomWidth: activeTab === 'PENDING' ? 3 : 0, borderColor: '#e74c3c'}}
                                    onPress={() => setActiveTab('PENDING')}
                                >
                                    <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'PENDING' ? '#e74c3c' : '#7f8c8d'}}>Pending</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={{flex: 1, paddingVertical: 10, borderBottomWidth: activeTab === 'PAID' ? 3 : 0, borderColor: '#2ecc71'}}
                                    onPress={() => setActiveTab('PAID')}
                                >
                                    <Text style={{textAlign: 'center', fontWeight: 'bold', color: activeTab === 'PAID' ? '#2ecc71' : '#7f8c8d'}}>Paid</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
                data={loan ? installments.filter(i => activeTab === 'PENDING' ? i.status !== 'PAID' : i.status === 'PAID') : []}
            />
        </View>

        <Modal visible={editInstModal} transparent={true} animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Edit Installment</Text>
                    <Text style={styles.modalLabel}>Amount</Text>
                    <TextInput style={styles.modalInput} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" />
                    <Text style={styles.modalLabel}>Due Date (YYYY-MM-DD)</Text>
                    <TextInput style={styles.modalInput} value={editDate} onChangeText={setEditDate} />
                    
                    <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#95a5a6'}]} onPress={() => setEditInstModal(false)}>
                            <Text style={styles.commBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71'}]} onPress={saveInstallmentEdit}>
                            <Text style={styles.commBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

        <Modal visible={editCustModal} transparent={true} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Edit Customer</Text>
                    
                    <Text style={styles.modalLabel}>Name</Text>
                    <TextInput style={styles.modalInput} placeholder="Name" value={custName} onChangeText={setCustName} />
                    <Text style={styles.modalLabel}>Phone</Text>
                    <TextInput style={styles.modalInput} placeholder="Phone" value={custPhone} onChangeText={(v) => handlePhoneChange(v, setCustPhone)} keyboardType="phone-pad" />
                    <Text style={styles.modalLabel}>Alternate Phone</Text>
                    <TextInput style={styles.modalInput} placeholder="Alternate Phone" value={custAlt} onChangeText={(v) => handlePhoneChange(v, setCustAlt)} keyboardType="phone-pad" />
                    <Text style={styles.modalLabel}>Book Number (Offline ID)</Text>
                    <TextInput style={styles.modalInput} placeholder="Book Number" value={custBook} onChangeText={setCustBook} />
                    <Text style={styles.modalLabel}>Unique ID (Aadhar/PAN)</Text>
                    <TextInput style={styles.modalInput} placeholder="Unique ID (Aadhar/PAN)" value={custUniqueId} onChangeText={setCustUniqueId} />
                    <Text style={styles.modalLabel}>Address</Text>
                    <TextInput style={styles.modalInput} placeholder="Address" value={custAddress} onChangeText={setCustAddress} />
                    
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
                        <TouchableOpacity style={[styles.commBtn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={pickImage}>
                            <Text style={styles.commBtnText}>📷 Update Photo</Text>
                        </TouchableOpacity>
                        {custPhotoUrl ? <Text style={{color: '#2ecc71', fontWeight: 'bold', fontSize: 10}}>✓ Selected</Text> : <Text style={{color: '#888', fontSize: 10}}>No Photo</Text>}
                    </View>

                    <Text style={styles.modalLabel}>Notes</Text>
                    <TextInput style={styles.modalInput} placeholder="Notes" value={custNotes} onChangeText={setCustNotes} />
                    
                    <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#95a5a6'}]} onPress={() => setEditCustModal(false)}>
                            <Text style={styles.commBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71'}]} onPress={saveCustomerEdit}>
                            <Text style={styles.commBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={{marginTop: 20}} onPress={handleDeleteCustomer}>
                        <Text style={{color: 'red', textAlign: 'center', fontWeight: 'bold'}}>Delete Customer Permanently</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

        <Modal visible={editLoanModal} transparent={true} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Edit Finance</Text>
                    
                    <Text style={styles.modalLabel}>Total Financed Amount</Text>
                    <TextInput style={styles.modalInput} value={loanEditData.total_finance_amount} onChangeText={(t) => setLoanEditData({...loanEditData, total_finance_amount: t})} keyboardType="numeric" />
                    <Text style={styles.modalLabel}>Installment Amount</Text>
                    <TextInput style={styles.modalInput} value={loanEditData.installment_amount} onChangeText={(t) => setLoanEditData({...loanEditData, installment_amount: t})} keyboardType="numeric" />
                    
                    {loanEditData.finance_type === 'GIRVI' ? (
                        <>
                            <Text style={styles.modalLabel}>Girvi Details</Text>
                            <TextInput style={styles.modalInput} placeholder="Collateral Name" value={loanEditData.collateral_name} onChangeText={(t) => setLoanEditData({...loanEditData, collateral_name: t})} />
                            <TextInput style={styles.modalInput} placeholder="Weight" value={loanEditData.collateral_weight?.toString()} onChangeText={(t) => setLoanEditData({...loanEditData, collateral_weight: t})} keyboardType="numeric" />
                            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
                                <TouchableOpacity style={[styles.commBtn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={async () => {
                                    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.2, base64: true });
                                    if (!result.canceled && result.assets && result.assets.length > 0) setLoanEditData({...loanEditData, collateral_photo_url: `data:image/jpeg;base64,${result.assets[0].base64}`});
                                }}>
                                    <Text style={styles.commBtnText}>📷 Update Item Photo</Text>
                                </TouchableOpacity>
                                {loanEditData.collateral_photo_url ? <Text style={{color: '#2ecc71', fontWeight: 'bold', fontSize: 10}}>✓ Selected</Text> : <Text style={{color: '#888', fontSize: 10}}>No Photo</Text>}
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={styles.modalLabel}>Vehicle Details (Optional)</Text>
                            <TextInput style={styles.modalInput} placeholder="Vehicle Name" value={loanEditData.vehicle_name} onChangeText={(t) => setLoanEditData({...loanEditData, vehicle_name: t})} />
                            <TextInput style={styles.modalInput} placeholder="Reg Number" value={loanEditData.vehicle_reg_number} onChangeText={(t) => setLoanEditData({...loanEditData, vehicle_reg_number: t})} />
                            <TextInput style={styles.modalInput} placeholder="Vendor Name" value={loanEditData.vendor_name} onChangeText={(t) => setLoanEditData({...loanEditData, vendor_name: t})} />
                            <TextInput style={styles.modalInput} placeholder="Insurance Company" value={loanEditData.insurance_company} onChangeText={(t) => setLoanEditData({...loanEditData, insurance_company: t})} />
                            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
                                <TouchableOpacity style={[styles.commBtn, {flex: 1, backgroundColor: '#95a5a6'}]} onPress={async () => {
                                    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.2, base64: true });
                                    if (!result.canceled && result.assets && result.assets.length > 0) setLoanEditData({...loanEditData, vehicle_photo_url: `data:image/jpeg;base64,${result.assets[0].base64}`});
                                }}>
                                    <Text style={styles.commBtnText}>📷 Update Vehicle Photo</Text>
                                </TouchableOpacity>
                                {loanEditData.vehicle_photo_url ? <Text style={{color: '#2ecc71', fontWeight: 'bold', fontSize: 10}}>✓ Selected</Text> : <Text style={{color: '#888', fontSize: 10}}>No Photo</Text>}
                            </View>
                        </>
                    )}
                    
                    <Text style={styles.modalLabel}>Late Fee Per Day</Text>
                    <TextInput style={styles.modalInput} value={loanEditData.late_fee_per_day} onChangeText={(t) => setLoanEditData({...loanEditData, late_fee_per_day: t})} keyboardType="numeric" />

                    <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#95a5a6'}]} onPress={() => setEditLoanModal(false)}>
                            <Text style={styles.commBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71'}]} onPress={saveLoanEdit}>
                            <Text style={styles.commBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

        <Modal visible={markAllModal} transparent={true} animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Pay Remaining Balance</Text>
                    
                    <Text style={{fontSize: 14, color: '#555', marginBottom: 10}}>
                        Remaining Base is ₹{loan?.total_finance_amount - totalPaid}. You can change this final settlement amount below.
                    </Text>

                    <Text style={styles.modalLabel}>Final Settlement Amount (₹)</Text>
                    <TextInput 
                        style={styles.modalInput} 
                        value={markAllFinalAmount} 
                        onChangeText={setMarkAllFinalAmount} 
                        keyboardType="numeric" 
                    />

                    <Text style={styles.modalLabel}>Paid Date</Text>
                    {Platform.OS === 'web' ? (
                        <TextInput 
                            style={[styles.modalInput, {marginBottom: 15}]} 
                            type="date"
                            value={format(paidDateObj, 'yyyy-MM-dd')} 
                            onChangeText={(text) => {
                                const d = new Date(text);
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

                    <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#95a5a6'}]} onPress={() => setMarkAllModal(false)}>
                            <Text style={styles.commBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71'}]} onPress={processMarkAll}>
                            <Text style={styles.commBtnText}>Confirm Payment</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

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
                      <TextInput 
                          style={[styles.modalInput, {marginBottom: 15}]} 
                          type="date"
                          value={format(paidDateObj, 'yyyy-MM-dd')} 
                          onChangeText={(text) => {
                              const d = new Date(text);
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
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#95a5a6'}]} onPress={() => setModalVisible(false)}>
                            <Text style={styles.commBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.commBtn, {backgroundColor: '#2ecc71'}]} onPress={submitPayment}>
                            <Text style={styles.commBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  headerCard: { backgroundColor: '#fff', padding: 20, marginBottom: 10, elevation: 2 },
  name: { fontSize: 22, fontWeight: 'bold' },
  phone: { fontSize: 16, color: '#666', marginBottom: 15 },
  commsRow: { flexDirection: 'row', gap: 10 },
  commBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  commBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  summaryCard: { backgroundColor: '#fff', padding: 15, marginHorizontal: 15, borderRadius: 8, marginBottom: 10 },
  summaryTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  
  instCard: { backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  instDate: { fontSize: 14, fontWeight: 'bold', color: '#555' },
  instAmt: { fontSize: 18, color: '#333', marginVertical: 3 },
  instStatus: { fontSize: 12, fontWeight: 'bold' },
  
  actionBtn: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  btnPay: { backgroundColor: '#2e64e5' },
  btnUndo: { backgroundColor: '#95a5a6' },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  
  noData: { textAlign: 'center', marginTop: 30, color: '#888' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 8, width: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  modalLabel: { fontSize: 14, color: '#555', marginBottom: 5 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginBottom: 15 },
  typeBtn: { paddingHorizontal: 15, paddingVertical: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, marginRight: 10 },
  typeBtnActive: { backgroundColor: '#2e64e5', borderColor: '#2e64e5' },
  typeBtnText: { color: '#555', fontSize: 12, fontWeight: 'bold' }
});
