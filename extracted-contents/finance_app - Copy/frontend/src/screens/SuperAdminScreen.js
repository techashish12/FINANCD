import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';

const TYPES=[
 ['TWO_WHEELER','Two wheeler'],['FOUR_WHEELER','Four wheeler'],['THREE_WHEELER','Three wheeler'],
 ['COMMERCIAL_VEHICLE','Commercial vehicle'],['GOLD_LOAN','Gold loan'],['SILVER_LOAN','Silver loan'],
 ['PERSONAL_LOAN','Personal loan'],['HOME_LOAN','Home loan'],['MORTGAGE','Mortgage'],
 ['PROPERTY_LOAN','Property loan'],['BUSINESS_LOAN','Business loan'],['EDUCATION_LOAN','Education loan'],
 ['AGRICULTURE_LOAN','Agriculture loan'],['UDHAR','Udhar / credit'],['GIRVI','Girvi / pledge'],
 ['INSURANCE','Insurance finance'],['OTHER','Other finance']
];
const notify=(title,message)=>Platform.OS==='web'?window.alert(title+'\n'+message):Alert.alert(title,message);
const Field=({value,onChangeText,placeholder,secureTextEntry,keyboardType})=><TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none"/>;
const Check=({label,checked,onPress})=><TouchableOpacity style={styles.check} onPress={onPress}><Text style={styles.checkMark}>{checked?'☑':'□'}</Text><Text style={styles.checkText}>{label}</Text></TouchableOpacity>;

export default function SuperAdminScreen(){
 const navigation=useNavigation();
 const [tenants,setTenants]=useState([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 const [companyName,setCompanyName]=useState('');const [email,setEmail]=useState('');const [phone,setPhone]=useState('');
 const [contactPerson,setContactPerson]=useState('');const [address,setAddress]=useState('');const [plan,setPlan]=useState('STANDARD');
 const [adminUsername,setAdminUsername]=useState('');const [adminPassword,setAdminPassword]=useState('');
 const [selected,setSelected]=useState(['TWO_WHEELER','FOUR_WHEELER','GOLD_LOAN','PERSONAL_LOAN']);
 const load=async()=>{try{const r=await api.get('/super/tenants');setTenants(r.data);}catch(e){notify('Could not load finance companies',e.message);}finally{setLoading(false);}};
 useEffect(()=>{load();},[]);
 const toggle=type=>setSelected(prev=>prev.includes(type)?prev.filter(x=>x!==type):[...prev,type]);
 const create=async()=>{
  if(!companyName.trim()||!email.trim()||!adminUsername.trim()||adminPassword.length<12||!selected.length){notify('Missing information','Enter company name, valid email, admin username, a 12+ character password and select at least one finance type.');return;}
  setSaving(true);
  try{
   await api.post('/super/tenants',{company_name:companyName.trim(),email:email.trim(),phone,contact_person:contactPerson,address,plan_name:plan,admin_username:adminUsername.trim(),admin_password:adminPassword,allowed_features:selected});
   notify('Finance company created','The company Admin account and selected finance products have been created.');
   setCompanyName('');setEmail('');setPhone('');setContactPerson('');setAddress('');setAdminUsername('');setAdminPassword('');setSelected([]);
   await load();
  }catch(e){notify('Account creation failed',e.message);}finally{setSaving(false);}
 };
 const toggleCompany=async t=>{try{await api.put('/super/tenants/'+t.id,{allowed_features:t.allowed_features,is_active:t.is_active?0:1});await load();}catch(e){notify('Could not update account',e.message);}};
 const logout=async()=>{if(Platform.OS==='web'){localStorage.clear();}else{await SecureStore.deleteItemAsync('token');await SecureStore.deleteItemAsync('role');}navigation.replace('Login');};
 return <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <View style={styles.header}><View><Text style={styles.eyebrow}>FINANCD PLATFORM</Text><Text style={styles.title}>Super Admin</Text><Text style={styles.sub}>Onboard and control independent finance companies</Text></View><TouchableOpacity onPress={logout}><Text style={styles.logout}>Logout</Text></TouchableOpacity></View>
  <TouchableOpacity style={styles.primary} onPress={()=>navigation.navigate('AdminManagement')}><Text style={styles.primaryText}>Open platform control center →</Text></TouchableOpacity>
  <View style={styles.card}>
   <Text style={styles.cardTitle}>Create finance company account</Text>
   <Text style={styles.help}>Each finance company receives its own tenant and Admin login. Its selected loan products define which finance types it can create.</Text>
   <Field value={companyName} onChangeText={setCompanyName} placeholder="Finance company / firm name *"/>
   <Field value={email} onChangeText={setEmail} placeholder="Official email address *" keyboardType="email-address"/>
   <Field value={phone} onChangeText={setPhone} placeholder="Mobile / WhatsApp number" keyboardType="phone-pad"/>
   <Field value={contactPerson} onChangeText={setContactPerson} placeholder="Owner / contact person"/>
   <Field value={address} onChangeText={setAddress} placeholder="Business address"/>
   <Field value={adminUsername} onChangeText={setAdminUsername} placeholder="Finance company Admin username *"/>
   <Field value={adminPassword} onChangeText={setAdminPassword} placeholder="Temporary password (minimum 12 characters) *" secureTextEntry/>
   <Text style={styles.sectionTitle}>Select finance products enabled for this company</Text>
   <View style={styles.types}>{TYPES.map(([key,label])=><Check key={key} label={label} checked={selected.includes(key)} onPress={()=>toggle(key)}/>)}</View>
   <Text style={styles.help}>Selected: {selected.length} finance products</Text>
   <TouchableOpacity style={[styles.primary,saving&&{opacity:.6}]} disabled={saving} onPress={create}><Text style={styles.primaryText}>{saving?'Creating account…':'Create finance company & Admin login'}</Text></TouchableOpacity>
  </View>
  <View style={styles.card}>
   <View style={styles.listHeader}><Text style={styles.cardTitle}>Finance companies ({tenants.length})</Text><TouchableOpacity onPress={load}><Text style={styles.link}>Refresh</Text></TouchableOpacity></View>
   {loading?<ActivityIndicator size="large"/>:tenants.map(t=><View key={t.id} style={styles.companyRow}>
    <View style={{flex:1}}><Text style={styles.companyName}>{t.company_name}</Text><Text style={styles.help}>{t.email || 'No email'} · {t.phone || 'No phone'}</Text><Text style={styles.help}>Products: {String(t.allowed_features||'ALL').split(',').join(', ')}</Text></View>
    <TouchableOpacity onPress={()=>toggleCompany(t)} style={[styles.status,{backgroundColor:t.is_active?'#e5f7ef':'#fff0f0'}]}><Text style={{color:t.is_active?'#16845b':'#c0392b',fontWeight:'800',fontSize:10}}>{t.is_active?'ACTIVE':'DISABLED'}</Text></TouchableOpacity>
   </View>)}
  </View>
 </ScrollView>;
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#f3f6fb'},content:{padding:16,paddingBottom:40,maxWidth:1000,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20,marginBottom:16},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.5,color:'#2459d3'},title:{fontSize:28,fontWeight:'900',color:'#15233d'},sub:{fontSize:12,color:'#758198',marginTop:3},logout:{color:'#c0392b',fontWeight:'800'},
 card:{backgroundColor:'#fff',padding:16,borderRadius:16,borderWidth:1,borderColor:'#e5ebf4',marginBottom:14},cardTitle:{fontSize:18,fontWeight:'800',color:'#182640',marginBottom:9},help:{fontSize:12,color:'#748198',lineHeight:18,marginBottom:10},
 input:{borderWidth:1,borderColor:'#e0e6ef',padding:12,borderRadius:10,marginBottom:9,fontSize:14,color:'#17243d'},primary:{backgroundColor:'#2459d3',padding:14,borderRadius:10,alignItems:'center',marginBottom:14},primaryText:{color:'#fff',fontWeight:'800',fontSize:13},
 sectionTitle:{fontSize:14,fontWeight:'800',color:'#182640',marginTop:7,marginBottom:9},types:{flexDirection:'row',flexWrap:'wrap',gap:4},check:{width:'48%',minWidth:135,flexDirection:'row',alignItems:'center',paddingVertical:7},checkMark:{fontSize:18,color:'#2459d3',marginRight:8},checkText:{fontSize:12,color:'#293851'},
 listHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},link:{color:'#2459d3',fontWeight:'700'},companyRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#edf0f5'},companyName:{fontSize:14,fontWeight:'800',color:'#182640'},status:{paddingHorizontal:9,paddingVertical:7,borderRadius:8}
});
