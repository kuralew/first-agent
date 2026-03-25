import { useState } from "react";

interface userProfileProps {
  name: string;
  email: string;
}

function userProfile({ name, email }: userProfileProps) {
    const [editing, setEditing] = useState(false);
    const [newName, setNewName] = useState(name);
    const [newEmail, setNewEmail] = useState(email);
    
    const handleSave = () => {
        // Here you would typically send the updated profile to the server
        console.log("Updated Profile:", { name: newName, email: newEmail });
        setEditing(false);
    };
    
    return (
        <div>
        {editing ? (
            <div>
            <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
            />
            <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
            />
            <button onClick={handleSave}>Save</button>
            </div>
        ) : (
            <div>
            <h2>{name}</h2>
            <p>{email}</p>
            <button onClick={() => setEditing(true)}>Edit Profile</button>
            </div>
        )}
        </div>
    );
    }

export default userProfile;