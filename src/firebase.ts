import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            'AIzaSyCwg68CV50FGXISL-7qEsfUwRnxGCXcLaY',
  authDomain:        'hanzi-storage.firebaseapp.com',
  projectId:         'hanzi-storage',
  storageBucket:     'hanzi-storage.firebasestorage.app',
  messagingSenderId: '500185685871',
  appId:             '1:500185685871:web:a6442e21949c5b10d1529a',
}

const app      = initializeApp(firebaseConfig)
export const firestore = getFirestore(app)
export const auth      = getAuth(app)
export const provider  = new GoogleAuthProvider()
