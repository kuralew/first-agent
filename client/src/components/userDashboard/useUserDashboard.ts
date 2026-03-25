import { useState, useEffect } from "react";

interface Document {
  id: number;
  title: string;
  status: string;
  clientName: string;
}

export function useUserDashboard() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        const activeDocs = data.filter((doc: Document) => doc.status === "active");
        const sorted = activeDocs.sort((a: Document, b: Document) =>
          a.clientName.localeCompare(b.clientName)
        );
        setAllDocuments(sorted);
        setDocuments(sorted);
        setIsLoading(false);
      });
  }, []);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    const filtered = allDocuments.filter((doc) =>
      doc.title.toLowerCase().includes(value.toLowerCase())
    );
    setDocuments(filtered);
  };

  return { documents, isLoading, searchTerm, handleSearch };
}
