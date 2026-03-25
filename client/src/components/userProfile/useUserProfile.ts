import { useState } from "react";

export function useUserProfile(name: string, email: string) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const [newEmail, setNewEmail] = useState(email);

  const handleSave = () => {
    console.log("Updated Profile:", { name: newName, email: newEmail });
    setEditing(false);
  };

  const startEditing = () => setEditing(true);

  return { editing, newName, newEmail, setNewName, setNewEmail, handleSave, startEditing };
}
