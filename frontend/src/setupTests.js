// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// react-router v7 needs these, and the jsdom version bundled with CRA lacks them.
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

// The login page reads this at import time.
process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
