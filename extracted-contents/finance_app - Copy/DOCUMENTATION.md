# FinTrack Developer Documentation

This document explains the core architecture of the FinTrack application and provides a step-by-step guide on how to extend it dynamically.

## Architecture Overview
The application is a **monorepo** consisting of two main parts:
1. **Frontend (React Native / Expo)**: Located in the `/frontend` directory. It uses React Navigation for routing, Expo Secure Store for local data, Axios for network calls, and React Native Chart Kit for analytics.
2. **Backend (Node.js / Express)**: Located in the `/backend` directory. It runs an Express HTTP server connected to a local SQLite database (`database.sqlite`).

## How to Add a New Page/Screen in the Frontend

1. **Create the Screen Component:**
   Create a new file in `frontend/src/screens/` (e.g., `NewScreen.js`).
   ```javascript
   import React from 'react';
   import { View, Text, StyleSheet } from 'react-native';

   export default function NewScreen() {
       return (
           <View style={styles.container}>
               <Text>Hello from New Screen!</Text>
           </View>
       );
   }

   const styles = StyleSheet.create({
       container: { flex: 1, justifyContent: 'center', alignItems: 'center' }
   });
   ```

2. **Register the Screen in the Router:**
   Open `frontend/src/navigation/AppNavigator.js`.
   Import your new screen at the top:
   ```javascript
   import NewScreen from '../screens/NewScreen';
   ```
   Add it to either the Bottom Tab Navigator (`HomeTabs`) or the Stack Navigator:
   ```javascript
   <Stack.Screen 
       name="NewRouteName" 
       component={NewScreen} 
       options={{ title: 'My New Page' }} 
   />
   ```

3. **Navigate to the Screen:**
   From any component, use the `useNavigation` hook:
   ```javascript
   import { useNavigation } from '@react-navigation/native';
   const navigation = useNavigation();
   // ...
   <TouchableOpacity onPress={() => navigation.navigate('NewRouteName')}>
       <Text>Go to New Page</Text>
   </TouchableOpacity>
   ```

## How to Add a New Table to the Database

1. **Update the Schema:**
   Open `backend/src/db.js`.
   Locate the `db.serialize` block where the tables are created. Add your new `CREATE TABLE` query.
   ```javascript
   db.run(`
       CREATE TABLE IF NOT EXISTS new_feature_table (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT,
           created_at DATETIME DEFAULT CURRENT_TIMESTAMP
       )
   `);
   ```

2. **Update the Seed/Reset Script (Optional but Recommended):**
   If you want mock data, open `backend/src/seed.js` and add an `INSERT` statement for your new table.

3. **Reset the Database (Dev only):**
   Run the following command to drop the old DB and create your new table:
   ```bash
   npm run --prefix backend reset-db
   ```

## How to Connect the Backend to the Frontend

1. **Create the Backend Endpoint (Express):**
   Open `backend/src/server.js`. Add a route that queries your new table:
   ```javascript
   app.get('/api/new-feature', (req, res) => {
       db.all(`SELECT * FROM new_feature_table`, [], (err, rows) => {
           if (err) return res.status(500).json({ error: err.message });
           res.json(rows);
       });
   });
   ```

2. **Create the Frontend API Call (Axios):**
   Open `frontend/src/api/index.js`. Export a function that calls your new endpoint:
   ```javascript
   export const getNewFeatureData = () => {
       return api.get('/new-feature');
   };
   ```

3. **Consume the Data in your React Native Screen:**
   In your `NewScreen.js`, use a `useEffect` hook to call the API when the page loads.
   ```javascript
   import React, { useState, useEffect } from 'react';
   import { getNewFeatureData } from '../api';

   export default function NewScreen() {
       const [data, setData] = useState([]);

       useEffect(() => {
           const fetchData = async () => {
               try {
                   const response = await getNewFeatureData();
                   setData(response.data);
               } catch (error) {
                   console.error(error);
               }
           };
           fetchData();
       }, []);

       // Render data here...
   }
   ```
