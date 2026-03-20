import * as React from "react"
import { SearchableSelect } from "../ui/searchable-select"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"

interface Option {
  id: string
  label: string
}

const STATIC_OPTIONS: Option[] = [
  { id: "1", label: "Apple" },
  { id: "2", label: "Banana" },
  { id: "3", label: "Cherry" },
  { id: "4", label: "Date" },
  { id: "5", label: "Elderberry" },
]

export function DebugSearchableSelect() {
  const [val1, setVal1] = React.useState<Option | null>(null)
  const [val2, setVal2] = React.useState<Option | null>(null)
  const [val3, setVal3] = React.useState<Option | null>(null)

  const [options3, setOptions3] = React.useState<Option[]>(STATIC_OPTIONS)

  return (
    <div className="p-10 space-y-10 max-w-2xl mx-auto bg-background min-h-screen text-foreground">
      <h1 className="text-3xl font-bold">SearchableSelect Debug</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>1. Local Static Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchableSelect
            value={val1}
            onChange={setVal1}
            options={STATIC_OPTIONS}
            getLabel={(item) => item.label}
            getValue={(item) => item.id}
            placeholder="Select a fruit..."
          />
          <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
            Selected: {val1 ? JSON.stringify(val1) : "None"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Remote Search (Mock)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchableSelect
            value={val2}
            onChange={setVal2}
            onSearch={async (query) => {
              console.log("Searching:", query)
              await new Promise(r => setTimeout(r, 800)) // Fake delay
              if (!query) return []
              return STATIC_OPTIONS.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
            }}
            getLabel={(item) => item.label}
            getValue={(item) => item.id}
            placeholder="Search remotely (try 'app')..."
          />
          <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
            Selected: {val2 ? JSON.stringify(val2) : "None"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Remote + Create + Custom Render</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchableSelect
            value={val3}
            onChange={setVal3}
            options={options3} // In local mode for simplicity of create demo, or can use onSearch
            allowCreate
            onCreate={(val) => {
               const newItem = { id: Date.now().toString(), label: val }
               setOptions3(prev => [...prev, newItem])
               setVal3(newItem)
               alert(`Created: ${val}`)
            }}
            getLabel={(item) => item.label}
            getValue={(item) => item.id}
            placeholder="Type a new fruit..."
            renderOption={(item, _isSelected) => (
                <div className="flex flex-col">
                    <span className="font-bold">{item.label}</span>
                    <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                </div>
            )}
          />
          <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
            Selected: {val3 ? JSON.stringify(val3) : "None"}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
