import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface EmployeeOption {
  id: string;
  full_name?: string | null;
  email?: string | null;
  name?: string | null;
}

interface EmployeeFilterComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  users: EmployeeOption[];
  placeholder?: string;
  includeAllOption?: boolean;
  allLabel?: string;
  className?: string;
}

export function EmployeeFilterCombobox({
  value,
  onValueChange,
  users,
  placeholder = "Select employee",
  includeAllOption = true,
  allLabel = "All Users",
  className,
}: EmployeeFilterComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const displayName = React.useMemo(() => {
    if (!value || value === "all") {
      return includeAllOption ? allLabel : placeholder;
    }
    const found = users.find((u) => u.id === value);
    return found?.full_name || found?.name || found?.email || value;
  }, [value, users, includeAllOption, allLabel, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", className)}
        >
          <span className="truncate">{displayName}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search employee..." />
          <CommandList>
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup>
              {includeAllOption && (
                <CommandItem
                  value={allLabel}
                  onSelect={() => {
                    onValueChange("all");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "all" || !value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {allLabel}
                </CommandItem>
              )}
              {users.map((user) => {
                const label = user.full_name || user.name || user.email || user.id;
                return (
                  <CommandItem
                    key={user.id}
                    value={label}
                    onSelect={() => {
                      onValueChange(user.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === user.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
