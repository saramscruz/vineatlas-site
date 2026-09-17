# patch-ficha-cambio.ps1 (v2 - imune a problemas de codificacao)
# Insere o cartao "O que o comprador sentiu" (efeito-cambio) no ficha.html do VineAtlas.
# So faz INSERCOES junto a 4 ancoras exatas -- nao reescreve nada que ja existe.
# O conteudo com acentos vai em Base64 (puro ASCII no .ps1) e e descodificado como UTF-8
# em runtime -- isto evita a corrupcao de caracteres que aconteceu na v1, causada pelo
# Windows PowerShell a interpretar o proprio ficheiro .ps1 com a codepage errada.
# Correr a partir da pasta do repo: .\patch-ficha-cambio.ps1

$path = ".\ficha.html"
if (-not (Test-Path $path)) {
    Write-Error "Nao encontrei ficha.html na pasta atual. Corra este script dentro da pasta do repo."
    exit 1
}

function Decode-B64Utf8($b64) {
    $bytes = [System.Convert]::FromBase64String($b64)
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

$enc = New-Object System.Text.UTF8Encoding($false)  # UTF-8 sem BOM
$content = [System.IO.File]::ReadAllText((Resolve-Path $path), $enc)
$original = $content

$b64_dados_cambio  = "Y29uc3QgQ0FNQklPID0gW3sibSI6IkFsZW1hbmhhIiwibW9lZGEiOiJFVVIiLCJ2ZXVyIjotMS4xLCJ2bG9jIjotMS4xfSx7Im0iOiJCw6lsZ2ljYSIsIm1vZWRhIjoiRVVSIiwidmV1ciI6LTQuNCwidmxvYyI6LTQuNH0seyJtIjoiQnJhc2lsIiwibW9lZGEiOiJCUkwiLCJ2ZXVyIjoyLjcsInZsb2MiOjExLjF9LHsibSI6IkNhbmFkw6EiLCJtb2VkYSI6IkNBRCIsInZldXIiOi0zLjAsInZsb2MiOjMuM30seyJtIjoiQ2hpbmEiLCJtb2VkYSI6IkNOWSIsInZldXIiOjEwLjAsInZsb2MiOjE0Ljd9LHsibSI6IkRpbmFtYXJjYSIsIm1vZWRhIjoiREtLIiwidmV1ciI6LTQuOCwidmxvYyI6LTQuOH0seyJtIjoiRXNwYW5oYSIsIm1vZWRhIjoiRVVSIiwidmV1ciI6NS40LCJ2bG9jIjo1LjR9LHsibSI6IkVzdGFkb3MgVW5pZG9zIGRhIEFtw6lyaWNhIiwibW9lZGEiOiJVU0QiLCJ2ZXVyIjotNy44LCJ2bG9jIjotMy43fSx7Im0iOiJGaW5sw6JuZGlhIiwibW9lZGEiOiJFVVIiLCJ2ZXVyIjotMS4yLCJ2bG9jIjotMS4yfSx7Im0iOiJGcmFuw6dhIiwibW9lZGEiOiJFVVIiLCJ2ZXVyIjo0LjEsInZsb2MiOjQuMX0seyJtIjoiSXJsYW5kYSIsIm1vZWRhIjoiRVVSIiwidmV1ciI6Ni4yLCJ2bG9jIjo2LjJ9LHsibSI6Ikl0w6FsaWEiLCJtb2VkYSI6IkVVUiIsInZldXIiOjMuOSwidmxvYyI6My45fSx7Im0iOiJKYXDDo28iLCJtb2VkYSI6IkpQWSIsInZldXIiOjIuOCwidmxvYyI6Ni4wfSx7Im0iOiJMdXhlbWJ1cmdvIiwibW9lZGEiOiJFVVIiLCJ2ZXVyIjoxLjksInZsb2MiOjEuOX0seyJtIjoiTm9ydWVnYSIsIm1vZWRhIjoiTk9LIiwidmV1ciI6Mi42LCJ2bG9jIjozLjR9LHsibSI6IlBhw61zZXMgQmFpeG9zIChSZWlubyBkb3MpIiwibW9lZGEiOiJFVVIiLCJ2ZXVyIjowLjUsInZsb2MiOjAuNX0seyJtIjoiUG9sw7NuaWEiLCJtb2VkYSI6IlBMTiIsInZldXIiOjIuMiwidmxvYyI6MC43fSx7Im0iOiJSZWlubyBVbmlkbyAobsOjbyBpbmNsdWluZG8gYSBJcmxhbmRhIGRvIE5vcnRlKSIsIm1vZWRhIjoiR0JQIiwidmV1ciI6MS45LCJ2bG9jIjozLjF9LHsibSI6IlN1w6ljaWEiLCJtb2VkYSI6IlNFSyIsInZldXIiOjEuNSwidmxvYyI6LTEuN30seyJtIjoiU3XDrcOnYSIsIm1vZWRhIjoiQ0hGIiwidmV1ciI6My4zLCJ2bG9jIjoxLjZ9XTs="
$b64_novo_card     = "PGRpdiBjbGFzcz0iY2FyZCIgaWQ9ImNhcmRDYW1iaW8iPgo8ZGl2IGNsYXNzPSJjYXJkLWgiPjxkaXYgY2xhc3M9ImNhcmQtdCI+TyBxdWUgbyBjb21wcmFkb3Igc2VudGl1IDxidXR0b24gY2xhc3M9ImluZm8tYnRuIiBpZD0iaW5mb0NhbWJpbyIgYXJpYS1leHBhbmRlZD0iZmFsc2UiIGFyaWEtY29udHJvbHM9ImluZm9DYW1iaW9QIiB0aXRsZT0iTyBxdWUgw6kgaXN0bz8iPj88L2J1dHRvbj48c21hbGw+UHJlw6dvIHF1ZSBjb2JyYW0gKOKCrCkgdnMgcHJlw6dvIG5hIG1vZWRhIGRlIHF1ZW0gY29tcHJhIMK3IDIwMjU8L3NtYWxsPjwvZGl2PjwvZGl2Pgo8ZGl2IGNsYXNzPSJpbmZvLXBhbmVsIiBpZD0iaW5mb0NhbWJpb1AiIGhpZGRlbj5PIHByZcOnbyBxdWUgY29icmFtIGrDoSBlc3TDoSBlbSBldXJvcy4gTWFzIHF1ZW0gY29tcHJhIHNlbnRlLW8gbmEgcHLDs3ByaWEgbW9lZGEg4oCUIGUgZXNzYSBtdWRhIHRvZG9zIG9zIGRpYXMsIG1lc21vIHF1ZSBuw6NvIG1leGFtIGVtIG5hZGEuIEFzIGR1YXMgY29sdW5hcyBtb3N0cmFtIGEgdmFyaWHDp8OjbyBkZSBwcmXDp28gZGUgMjAyNCBwYXJhIDIwMjUgZW0gY2FkYSBtb2VkYTogc2UgZm9yZW0gbXVpdG8gZGlmZXJlbnRlcywgcGFydGUgZG8gcXVlIHBhcmVjZSAibyBtZXJjYWRvIGEgbXVkYXIiIMOpIGPDom1iaW8sIG7Do28gZGVjaXPDo28gZGUgbmluZ3XDqW0uIE1lcmNhZG9zIGRhIHpvbmEgZXVybyBuw6NvIHTDqm0gZXN0ZSBlZmVpdG8gKG1lc21hIG1vZWRhKS48L2Rpdj4KPGRpdiBjbGFzcz0ia3BpcyIgaWQ9ImtwaXNDYW1iaW8iIHN0eWxlPSJncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKTsgbWFyZ2luOjAgMThweCAxNnB4Ij48L2Rpdj4KPC9kaXY+"
$b64_funcao_cambio = "LyogLS0tLSBjYW1iaW86IG8gcXVlIG8gY29tcHJhZG9yIHNlbnRpdSAtLS0tICovCmZ1bmN0aW9uIHJlbmRlckNhbWJpbygpewogIGNvbnN0IGNhcmQ9JCgnI2NhcmRDYW1iaW8nKTsgY29uc3Qgd3JhcD0kKCcja3Bpc0NhbWJpbycpOwogIGNvbnN0IGM9Q0FNQklPLmZpbmQoZD0+ZC5tPT09c3RhdGUucGFpcyk7CiAgaWYoIWMpeyBjYXJkLnN0eWxlLmRpc3BsYXk9J25vbmUnOyByZXR1cm47IH0KICBjYXJkLnN0eWxlLmRpc3BsYXk9Jyc7CiAgY29uc3Qgem9uYUV1cm8gPSBjLm1vZWRhPT09J0VVUic7CiAgd3JhcC5pbm5lckhUTUw9WwogICAgWydPIHF1ZSBjb2JyYW0gKOKCrCknLCBwY3QoYy52ZXVyKSwgJ3Zhcmlhw6fDo28gZG8gcHJlw6dvIGVtIGV1cm9zLCAyMDI04oaSMjAyNSddLAogICAgW3pvbmFFdXJvPydPIHF1ZSBzZW50ZW0gKG1lc21hIG1vZWRhKSc6YE8gcXVlIHNlbnRlbSAoJHtjLm1vZWRhfSlgLCBwY3QoYy52bG9jKSwgem9uYUV1cm8/J3pvbmEgZXVybyDigJQgc2VtIGVmZWl0byBkZSBjw6JtYmlvJzondmFyaWHDp8OjbyBkbyBwcmXDp28gbmEgbW9lZGEgZGUgcXVlbSBjb21wcmEnXSwKICBdLm1hcCgoW2ssdixkXSk9PmA8ZGl2IGNsYXNzPSJrcGkiPjxkaXYgY2xhc3M9ImsiPiR7a308L2Rpdj48ZGl2IGNsYXNzPSJ2Ij4ke3Z9PC9kaXY+PGRpdiBjbGFzcz0iZCI+JHtkfTwvZGl2PjwvZGl2PmApLmpvaW4oJycpOwp9"
$b64_handler_info  = "JCgnI2luZm9DYW1iaW8nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsKCk9PnsgY29uc3QgcD0kKCcjaW5mb0NhbWJpb1AnKTsgY29uc3QgYWJlcnRvPSFwLmhpZGRlbjsgcC5oaWRkZW49YWJlcnRvOyAkKCcjaW5mb0NhbWJpbycpLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsU3RyaW5nKCFhYmVydG8pKTsgfSk7"

$dadosCambio  = Decode-B64Utf8 $b64_dados_cambio
$novoCard     = Decode-B64Utf8 $b64_novo_card
$funcaoCambio = Decode-B64Utf8 $b64_funcao_cambio
$handlerInfo  = Decode-B64Utf8 $b64_handler_info

# 1) Dados: nova constante CAMBIO, inserida mesmo antes de "const D = {..."
$anchor1 = 'const D = {"ficha":'
if ($content -notlike "*$anchor1*") { Write-Error "Ancora 1 nao encontrada (const D = ...). Abortar."; exit 1 }
$content = $content.Replace($anchor1, "$dadosCambio`n$anchor1")

# 2) HTML: novo cartao, logo a seguir aos KPIs existentes
$anchor2 = '<div class="kpis" id="kpis"></div>'
if ($content -notlike "*$anchor2*") { Write-Error "Ancora 2 nao encontrada (div kpis). Abortar."; exit 1 }
$content = $content.Replace($anchor2, "$anchor2`n$novoCard")

# 3) JS: funcao renderCambio(), antes do bloco "---- render ----"
$anchor3 = '/* ---- render ---- */'
if ($content -notlike "*$anchor3*") { Write-Error "Ancora 3 nao encontrada (comentario render). Abortar."; exit 1 }
$content = $content.Replace($anchor3, "$funcaoCambio`n$anchor3")

# 4) JS: chamar renderCambio() dentro de render()
$anchor4 = 'drawMonthly(); drawSeason();'
if ($content -notlike "*$anchor4*") { Write-Error "Ancora 4 nao encontrada (drawMonthly/drawSeason). Abortar."; exit 1 }
$content = $content.Replace($anchor4, 'drawMonthly(); drawSeason(); renderCambio();')

# 5) JS: handler de clique no botao "?" do novo cartao
$anchor5 = "addEventListener('resize',()=>{});"
if ($content -notlike "*$anchor5*") { Write-Error "Ancora 5 nao encontrada (resize listener). Abortar."; exit 1 }
$content = $content.Replace($anchor5, "$handlerInfo`n$anchor5")

if ($content -eq $original) {
    Write-Warning "Nada mudou -- alguma ancora nao bateu certo. Nao escrevi o ficheiro."
    exit 1
}

[System.IO.File]::WriteAllText((Resolve-Path $path), $content, $enc)
Write-Host "ficha.html atualizado. Reveja com 'git diff' antes de dar commit." -ForegroundColor Green
