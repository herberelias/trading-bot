Expand-Archive -Path 'TradingBot_Cambios_v2.docx' -DestinationPath 'temp_docx' -Force
[xml]$doc = Get-Content 'temp_docx\word\document.xml' -Raw
$doc.SelectNodes("//*[local-name()='t']") | ForEach-Object { $_.'#text' } | Out-File doc_text.txt -Encoding UTF8
Remove-Item 'temp_docx' -Recurse -Force
