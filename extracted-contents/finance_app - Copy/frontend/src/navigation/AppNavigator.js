import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import DashboardScreen from '../screens/DashboardScreen';
import CustomersScreen from '../screens/CustomersScreen';
import AddFinanceScreen from '../screens/AddFinanceScreen';
import CustomerDetailsScreen from '../screens/CustomerDetailsScreen';
import LoginScreen from '../screens/LoginScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CollectionHistoryScreen from '../screens/CollectionHistoryScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SuperAdminScreen from '../screens/SuperAdminScreen';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: '#2e64e5' },
          headerTintColor: '#fff',
          tabBarActiveTintColor: '#2e64e5',
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Dashboard') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Customers') {
              iconName = focused ? 'people' : 'people-outline';
            } else if (route.name === 'History') {
              iconName = focused ? 'time' : 'time-outline';
            } else if (route.name === 'Reports') {
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Customers" component={CustomersScreen} />
        <Tab.Screen name="History" component={CollectionHistoryScreen} />
        <Tab.Screen name="Reports" component={ReportsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
        <Tab.Screen 
            name="CustomerDetails" 
            component={CustomerDetailsScreen} 
            options={{ tabBarButton: () => null, title: 'Customer Details', headerLeft: () => null }}
        />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SuperAdmin" component={SuperAdminScreen} />
        <Stack.Screen name="Home" component={HomeTabs} />
        <Stack.Screen 
            name="AddFinance" 
            component={AddFinanceScreen} 
            options={{ headerShown: true, title: 'New Finance', headerStyle: { backgroundColor: '#2e64e5' }, headerTintColor: '#fff', headerBackTitleVisible: false }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
