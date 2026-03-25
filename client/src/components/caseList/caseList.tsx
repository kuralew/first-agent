// caseList.tsx
import React, { useState } from 'react';

interface Case {
  id: number;
  title: string;
  attorney: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
}

const cases: Case[] = [
  { id: 1, title: 'Smith vs Jones', attorney: 'John Doe', priority: 'high', dueDate: '2024-03-15' },
  { id: 2, title: 'Brown vs State', attorney: 'Jane Smith', priority: 'low', dueDate: '2024-04-01' },
];

export const caseList = ({ onSelectCase }: { onSelectCase: (id: number) => void }) => {
  const [sortField, setSortField] = useState<'attorney' | 'dueDate' | 'priority'>('dueDate');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const priorityOrder = { high: 1, medium: 2, low: 3 };

  const getFilteredAndSortedCases = () => {
    let result = [...cases];
    
    if (filterPriority !== 'all') {
      result = result.filter(c => c.priority === filterPriority);
    }

    result.sort((a, b) => {
      if (sortField === 'priority') {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (sortField === 'dueDate') {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return a.attorney.localeCompare(b.attorney);
    });

    return result;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };

  return (
    <div style={{ color: '#000000' }}>
      <div>
        <select onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select onChange={(e) => setSortField(e.target.value as any)}>
          <option value="dueDate">Sort by Due Date</option>
          <option value="attorney">Sort by Attorney</option>
          <option value="priority">Sort by Priority</option>
        </select>
      </div>
      {getFilteredAndSortedCases().map(c => (
        <div key={c.id}>
          <span style={{ color: '#333333' }}>{c.title}</span>
          <span>{c.attorney}</span>
          <span>{formatDate(c.dueDate)}</span>
          <span>{c.priority}</span>
          <a href={`/cases/${c.id}`} style={{ color: '#000000' }}>
            View Details
          </a>
          <button onClick={() => onSelectCase(c.id)}>
            Select Case
          </button>
        </div>
      ))}
      <a href="/cases/new" style={{ color: '#000042', textDecoration: 'none' }}>
        + Add New Case
      </a>
    </div>
  );
};

export default caseList;