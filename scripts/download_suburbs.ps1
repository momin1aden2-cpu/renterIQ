$url = "https://raw.githubusercontent.com/schappim/australian-postcodes/master/australian-postcodes.json"
$outputPath = "public/data/suburbs.json"

Write-Host "Fetching Australian suburbs data..."

$response = Invoke-WebRequest -Uri $url -TimeoutSec 60
$data = $response.Content | ConvertFrom-Json

Write-Host "Total entries: $($data.Count)"

$suburbs = @()
for ($i = 1; $i -lt $data.Count; $i++) {
    $item = $data[$i]
    if ($item.suburb -and $item.state -and $item.postcode) {
        $suburbs += @{
            name = $item.suburb
            state = $item.state
            postcode = $item.postcode
        }
    }
}

# Remove duplicates
$unique = @{}
$filtered = @()
foreach ($s in $suburbs) {
    $key = "$($s.name)|$($s.state)|$($s.postcode)"
    if (-not $unique.ContainsKey($key)) {
        $unique[$key] = $true
        $filtered += $s
    }
}

$result = @{ suburbs = $filtered } | ConvertTo-Json -Depth 3
$result | Set-Content $outputPath

Write-Host "Saved $($filtered.Count) unique suburbs to $outputPath"
