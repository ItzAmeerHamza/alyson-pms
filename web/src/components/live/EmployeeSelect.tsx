import React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Employee } from "@/integrations/supabase/live";

type Props = {
  value: Employee | null;
  onChange: (emp: Employee | null) => void;
  search: string;
  onSearch: (q: string) => void;
  options: Employee[];
  loading?: boolean;
};

export function EmployeeSelect({ value, onChange, search, onSearch, options, loading }: Props) {
  return (
    <div className="w-full max-w-xl">
      <Command>
        <CommandInput placeholder="Search employee..." value={search} onValueChange={onSearch} />
        <CommandEmpty>{loading ? "Loading..." : "No employees found."}</CommandEmpty>
        <ScrollArea className="h-60">
          <CommandGroup>
            {options.map((u) => (
              <CommandItem key={u.id} value={u.full_name} onSelect={() => onChange(u)}>
                <div className="flex items-center gap-3">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={u.avatar_url || undefined} />
                    <AvatarFallback>{u.full_name?.slice(0, 2).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground">{u.id}</div>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </ScrollArea>
      </Command>
      {value && (
        <div className="mt-2 text-xs text-muted-foreground">Selected: {value.full_name}</div>
      )}
    </div>
  );
}

export default EmployeeSelect;


