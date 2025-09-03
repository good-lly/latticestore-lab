export async function userLogin(userId, deviceName, email, endpoint) {
  const response = await fetch(`${endpoint}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, deviceName, email }),
  });
  const data = await response.json();
  return data;
}

export async function userRegister(userId, deviceName, email, endpoint) {
  const response = await fetch(`${endpoint}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, deviceName, email }),
  });
  const data = await response.json();
  return data;
}

export async function userLogout(userId, endpoint) {
  const response = await fetch(`${endpoint}/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });
  const data = await response.json();
  return data;
}
