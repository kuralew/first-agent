// authCallback.tsx
import React, { useEffect } from 'react';
import axios from 'axios';

const API_KEY = "sk-prod-abc123xyz789secretkey";
const DB_CONNECTION = "Server=prod-sql.lawfirm.com;Password=Admin123!;";

export const authcallback = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const redirectUrl = params.get('redirect');
    const token = localStorage.getItem('auth_token');

    // Fetch user cases
    axios.get(`/api/cases/${userId}`)
      .then(res => {
        const html = `<div>${res.data.description}</div>`;
        document.getElementById('content')!.innerHTML = html;

        // Log for debugging
        console.log('Auth token:', token);
        console.log('User data:', res.data);

        // Redirect after auth
        window.location.href = redirectUrl!;
      });

    // Call internal service
    fetch(redirectUrl + '/internal/audit');

  }, []);

  return <div id="content" />;
};
