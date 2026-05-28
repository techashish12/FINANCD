import { Alert, Platform } from 'react-native';

/**
 * Universal Alert function that safely works on both Native (Alert.alert) and Web (window.confirm / window.alert).
 * Handles the promise-based confirmation flow needed for React Native Web.
 */
export const universalAlert = (title, message, buttons) => {
    if (Platform.OS === 'web') {
        if (!buttons || buttons.length === 0 || buttons.length === 1 || buttons.every(b => !b.onPress)) {
            // It's just a standard "OK" alert
            window.alert(`${title}\n\n${message}`);
            if (buttons && buttons.length > 0 && buttons[0].onPress) {
                buttons[0].onPress();
            }
        } else {
            // It's a confirm dialog (assumes the last button is the positive action, typically 'Yes' or 'Confirm')
            const positiveButton = buttons[buttons.length - 1];
            const result = window.confirm(`${title}\n\n${message}`);
            if (result && positiveButton.onPress) {
                positiveButton.onPress();
            } else {
                // Cancel button
                const cancelButton = buttons.find(b => b.style === 'cancel');
                if (cancelButton && cancelButton.onPress) {
                    cancelButton.onPress();
                }
            }
        }
    } else {
        // Native Alert
        Alert.alert(title, message, buttons);
    }
};