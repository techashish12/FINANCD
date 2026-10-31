import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';

const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const notify = (title, message) => Platform.OS === 'web' ? window.alert(title + '\n' + message) : Alert.alert(title, message);

function Field({ value, onChangeText, placeholder, keyboardType }) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType || 'default'} style={styles.input} />;
}
function Action({ title, onPress, secondary }) {
  return <TouchableOpacity onPress={onPress} style={[styles.button, secondary && styles.secondary]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></TouchableOpacity>;
}
function Panel({ title, children }) {
  return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{children}</View>;
}

export default function AdminManagementScreen() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [branches, setBranches] = useState([]);
  const [staff, setStaff] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState('AGENT');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0,10));
  const [expenseBranch, setExpenseBranch] = useState('');
  const [receiptInstallment, setReceiptInstallment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o,b,s,e,f] = await Promise.all([
        api.get('/manage/overview'), api.get('/manage/branches'),
        api.get('/manage/staff'), api.get('/manage/expenses'),
        api.get('/manage/reports/financial')
      ]);
      setOverview(o.data); setBranches(b.data); setStaff(s.data); setExpenses(e.data); setFinancial(f.data);
    } catch (error) {
      notify('Management data unavailable', error.message || 'Please check your account permissions and backend connection.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createBranch = async () => {
    if (!branchName.trim()) return notify('Missing details','Enter a branch name.');
    try {
      await api.post('/manage/branches',{name:branchName.trim(),code:branchCode.trim()});
      setBranchName(''); setBranchCode(''); await load(); notify('Saved','Branch created.');
    } catch(e) { notify('Could not create branch',e.message); }
  };

  const createStaff = async () => {
    if (!staffName.trim() || staffPassword.length < 12) return notify('Check details','Enter a username and a password of at least 12 characters.');
    try {
      await api.post('/manage/staff',{username:staffName.trim(),password:staffPassword,role:staffRole});
      setStaffName(''); setStaffPassword(''); await load(); notify('Saved','Staff account created.');
    } catch(e) { notify('Could not create staff',e.message); }
  };

  const createExpense = async () => {
    const amount=Number(expenseAmount);
    if(!expenseCategory.trim() || !Number.isFinite(amount) || amount<=0) return notify('Check details','Enter an expense category and positive amount.');
    try {
      await api.post('/manage/expenses',{category:expenseCategory.trim(),amount,expense_date:expenseDate,branch_id:expenseBranch ? Number(expenseBranch) : null});
      setExpenseCategory('');setExpenseAmount('');await load();notify('Saved','Expense recorded.');
    } catch(e) { notify('Could not record expense',e.message); }
  };

  const issueReceipt = async () => {
    if(!receiptInstallment.trim()) return notify('Missing installment','Enter a paid installment ID.');
    try {
      const response=await api.post('/manage/receipts',{installment_id:Number(receiptInstallment)});
      const r=response.data.receipt;
      notify('Receipt created',r.receipt_number+'\nAmount: '+money(r.amount)+'\nDate: '+r.paid_date);
    } catch(e) { notify('Could not create receipt',e.message); }
  };

  const backup = async () => {
    try {
      const response=await api.get('/manage/backup',{responseType:'blob'});
      if(Platform.OS==='web') {
        const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download='financd-backup.sqlite';link.click();URL.revokeObjectURL(url);
      } else notify('Backup endpoint ready','Use the authenticated backup endpoint from a browser or download client.');
    } catch(e) { notify('Backup unavailable',e.message); }
  };

  if(loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2459d3"/><Text style={styles.muted}>Loading management dashboard…</Text></View>;

  const totals=overview?.totals || {};
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View><Text style={styles.eyebrow}>FINANCD CONTROL CENTER</Text><Text style={styles.title}>Management</Text><Text style={styles.muted}>Administration, branches and financial performance</Text></View>
        <Action title="Refresh" secondary onPress={load}/>
      </View>

      <View style={styles.metrics}>
        {(overview?.companies || []).length>0 && <View style={styles.metric}><Text style={styles.metricLabel}>Organizations</Text><Text style={styles.metricValue}>{totals.companies || 0}</Text></View>}
        <View style={styles.metric}><Text style={styles.metricLabel}>Customers</Text><Text style={styles.metricValue}>{totals.customers || 0}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Kist / Loans</Text><Text style={styles.metricValue}>{totals.loans || 0}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Collected</Text><Text style={styles.metricValue}>{money(financial?.income ?? totals.collected)}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Outstanding</Text><Text style={styles.metricValue}>{money(totals.outstanding)}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Overdue Kist</Text><Text style={styles.metricValue}>{totals.overdue || 0}</Text></View>
      </View>

      <View style={styles.grid}>
        <Panel title="Branch management">
          <Field value={branchName} onChangeText={setBranchName} placeholder="Branch name"/>
          <Field value={branchCode} onChangeText={setBranchCode} placeholder="Branch code (optional)"/>
          <Action title="Add branch" onPress={createBranch}/>
          {branches.map(b=><View key={b.id} style={styles.row}><View style={{flex:1}}><Text style={styles.rowTitle}>{b.name}</Text><Text style={styles.muted}>{b.code || 'No code'} · {b.company_name || 'Current organization'}</Text></View><Text style={b.is_active ? styles.active : styles.inactive}>{b.is_active ? 'ACTIVE':'DISABLED'}</Text></View>)}
          {!branches.length && <Text style={styles.muted}>No branches added yet.</Text>}
        </Panel>

        <Panel title="Staff & permissions">
          <Field value={staffName} onChangeText={setStaffName} placeholder="Staff username"/>
          <Field value={staffPassword} onChangeText={setStaffPassword} placeholder="Temporary password (12+ characters)"/>
          <View style={styles.roleRow}><Action title="Staff / Agent" secondary={staffRole!=='AGENT'} onPress={()=>setStaffRole('AGENT')}/><Action title="Admin" secondary={staffRole!=='ADMIN'} onPress={()=>setStaffRole('ADMIN')}/></View>
          <Text style={styles.muted}>Only Super Admin can create Admin accounts. Branch permissions can be assigned through the management API.</Text>
          <Action title="Create staff account" onPress={createStaff}/>
          {staff.map(u=><View key={u.id} style={styles.row}><Text style={styles.rowTitle}>{u.username}</Text><Text style={styles.tag}>{u.role}</Text></View>)}
        </Panel>

        <Panel title="Income, expenses & net">
          <View style={styles.financeRow}><Text style={styles.muted}>Collections</Text><Text style={styles.amount}>{money(financial?.income)}</Text></View>
          <View style={styles.financeRow}><Text style={styles.muted}>Operating expenses</Text><Text style={styles.amount}>{money(financial?.expenses)}</Text></View>
          <View style={styles.financeRow}><Text style={styles.rowTitle}>Net cash result</Text><Text style={[styles.amount,{color:Number(financial?.net||0)>=0?'#16845b':'#c43c45'}]}>{money(financial?.net)}</Text></View>
          <Text style={styles.muted}>Cash collections less recorded operating expenses; not statutory accounting profit.</Text>
          <Field value={expenseCategory} onChangeText={setExpenseCategory} placeholder="Expense category (rent, salary…)"/>
          <Field value={expenseAmount} onChangeText={setExpenseAmount} placeholder="Amount in ₹" keyboardType="decimal-pad"/>
          <Field value={expenseDate} onChangeText={setExpenseDate} placeholder="Date YYYY-MM-DD"/>
          <Field value={expenseBranch} onChangeText={setExpenseBranch} placeholder="Branch ID (optional)" keyboardType="numeric"/>
          <Action title="Record expense" onPress={createExpense}/>
        </Panel>

        <Panel title="Receipts & database backup">
          <Text style={styles.muted}>Create a receipt for an installment that has already been marked PAID.</Text>
          <Field value={receiptInstallment} onChangeText={setReceiptInstallment} placeholder="Paid installment ID" keyboardType="numeric"/>
          <Action title="Generate receipt" onPress={issueReceipt}/>
          <View style={{height:12}}/>
          <Text style={styles.muted}>Full SQLite backup is restricted to Super Admin.</Text>
          <Action title="Download database backup" secondary onPress={backup}/>
        </Panel>

        <Panel title="Recent operating expenses">
          {expenses.slice(0,8).map(item=><View key={item.id} style={styles.row}><View style={{flex:1}}><Text style={styles.rowTitle}>{item.category}</Text><Text style={styles.muted}>{item.expense_date} · {item.branch_name || 'Organization'}</Text></View><Text style={styles.amount}>{money(item.amount)}</Text></View>)}
          {!expenses.length && <Text style={styles.muted}>No expenses recorded.</Text>}
        </Panel>
      </View>
    </ScrollView>
  );
}

const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:'#f3f6fb'},content:{padding:16,paddingBottom:40,maxWidth:1180,width:'100%',alignSelf:'center'},
  loading:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#f3f6fb'},
  top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:18,flexWrap:'wrap',gap:12},
  eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.5,color:'#2459d3'},title:{fontSize:28,fontWeight:'800',color:'#15233d',marginTop:4},
  muted:{fontSize:12,color:'#748198',lineHeight:18},metrics:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:14},
  metric:{backgroundColor:'#fff',borderRadius:14,padding:14,minWidth:145,flexGrow:1,borderWidth:1,borderColor:'#e8edf5'},
  metricLabel:{fontSize:11,color:'#748198'},metricValue:{fontSize:20,fontWeight:'800',color:'#17243d',marginTop:7},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:12},panel:{backgroundColor:'#fff',borderRadius:16,padding:16,borderWidth:1,borderColor:'#e8edf5',width:'100%',maxWidth:570,flexGrow:1},
  panelTitle:{fontSize:16,fontWeight:'800',color:'#182640',marginBottom:12},input:{borderWidth:1,borderColor:'#e1e7f0',borderRadius:10,paddingHorizontal:12,paddingVertical:11,marginBottom:9,fontSize:14,color:'#17243d',backgroundColor:'#fff'},
  button:{backgroundColor:'#2459d3',paddingVertical:11,paddingHorizontal:14,borderRadius:10,alignItems:'center',justifyContent:'center',marginBottom:9},
  buttonText:{color:'#fff',fontSize:13,fontWeight:'700'},secondary:{backgroundColor:'#eef3ff'},secondaryText:{color:'#2459d3'},
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#f0f2f6'},
  rowTitle:{fontSize:13,fontWeight:'700',color:'#1d2b45'},active:{fontSize:10,color:'#16845b',fontWeight:'800'},inactive:{fontSize:10,color:'#c43c45',fontWeight:'800'},
  tag:{fontSize:10,fontWeight:'800',color:'#2459d3',backgroundColor:'#eef3ff',padding:6,borderRadius:7},roleRow:{flexDirection:'row',gap:8},financeRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:7},
  amount:{fontSize:13,fontWeight:'800',color:'#182640'}
});
