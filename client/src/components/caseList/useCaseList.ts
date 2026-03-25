import { useState, useMemo } from "react";
import { priorityOrder } from "./CaseList.utils.ts";

interface Case {
  id: number;
  title: string;
  attorney: string;
  priority: "high" | "medium" | "low";
  dueDate: string;
}

const cases: Case[] = [
  { id: 1, title: "Smith vs Jones", attorney: "John Doe", priority: "high", dueDate: "2024-03-15" },
  { id: 2, title: "Brown vs State", attorney: "Jane Smith", priority: "low", dueDate: "2024-04-01" },
];

export function useCaseList() {
  const [sortField, setSortField] = useState<"attorney" | "dueDate" | "priority">("dueDate");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const filteredAndSortedCases = useMemo(() => {
    let result = [...cases];

    if (filterPriority !== "all") {
      result = result.filter((c) => c.priority === filterPriority);
    }

    result.sort((a, b) => {
      if (sortField === "priority") {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (sortField === "dueDate") {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return a.attorney.localeCompare(b.attorney);
    });

    return result;
  }, [sortField, filterPriority]);

  return { filteredAndSortedCases, setSortField, filterPriority, setFilterPriority };
}
