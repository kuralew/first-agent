import { useUserProfile } from "./useUserProfile.ts";

interface UserProfileProps {
  name: string;
  email: string;
}

export default function UserProfile({ name, email }: UserProfileProps) {
  const { editing, newName, newEmail, setNewName, setNewEmail, handleSave, startEditing } =
    useUserProfile(name, email);

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
          <button onClick={startEditing}>Edit Profile</button>
        </div>
      )}
    </div>
  );
}
