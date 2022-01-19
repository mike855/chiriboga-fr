<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>Chiriboga</title>
		<link href="images/favicon.ico" rel="icon">
		<?php
		echo '<link rel="stylesheet" type="text/css" href="style.css?' . filemtime('style.css') . '" />';
		?> 
		<link rel="manifest" href="manifest.json">
		<script src="jquery/jquery-3.2.1.min.js"></script>
		<script src="cardrenderer/pixi.min.js"></script>
		<script src="cardrenderer/pixi-particles.min.js"></script>
		<script src="cardrenderer/particlesystems.js"></script>
		<script src="cardrenderer/cardrenderer.js"></script>
		<style>
			@font-face {
			  font-family: PlayBoldUnambig;
			  src: url('cardrenderer/Play-Bold-Unambig.ttf');
			  font-weight: bold;
			}
		</style>
		<script src="cardrenderer/webfont.js"></script>
		<script>
			WebFont.load({
				custom: {
					families: [
						'PlayBoldUnambig'
					]
				}
			});
		</script>
		<script src="deck/lz-string.min.js"></script>
		<script src="deck/seedrandom.min.js"></script>
		<?php
		echo '<link rel="stylesheet" type="text/css" href="style.css?' . filemtime('style.css') . '" />';
		echo '<script src="init.js?' . filemtime('init.js') . '"></script>';
		echo '<script src="phase.js?' . filemtime('phase.js') . '"></script>';
		echo '<script src="command.js?' . filemtime('command.js') . '"></script>';
		echo '<script src="checks.js?' . filemtime('checks.js') . '"></script>';
		echo '<script src="mechanics.js?' . filemtime('mechanics.js') . '"></script>';
		echo '<script src="utility.js?' . filemtime('utility.js') . '"></script>';
		echo '<script src="sets/systemgateway.js?' . filemtime('sets/systemgateway.js') . '"></script>';
		echo '<script src="sets/tutorial.js?' . filemtime('sets/tutorial.js') . '"></script>';
		echo '<script src="sets/cheat.js?' . filemtime('sets/cheat.js') . '"></script>';
		echo '<script src="decks.js?' . filemtime('decks.js') . '"></script>';
		echo '<script src="runcalculator.js?' . filemtime('runcalculator.js') . '"></script>';
		echo '<script src="ai_corp.js?' . filemtime('ai_corp.js') . '"></script>';
		echo '<script src="ai_runner.js?' . filemtime('ai_runner.js') . '"></script>';
		?> 
	</head>

	<body id="body" onload="Init();">
		<div id="contentcontainer" class="content">
			<div id="output"></div>
			<form id="cmdform">
				<input type="submit" value="Submit">
				<span id="turnphase"></span>
				<input id="command" type="text" value="">
			</form>
		</div>
		<div id="menubar"><button onclick="$('#menu').css('display','flex'); if (document.fullscreen) document.exitFullscreen(); $('.fullscreen-button').show();"><img src="images/chiriboga_withtext.png"></button></div>
		<div id="header"></div>
		<button class="fullscreen-button" onclick="document.getElementById('body').requestFullscreen({ navigationUI: 'hide' }); $('.fullscreen-button').hide();"></button>
		<div id="fps"></div>
		<div id="footer"></div>
		<div id="modal" class="modal">
			<div id="modalcontent" class="modal-content"></div>
		</div>
		<div id="history-wrapper">
			<div id="history"></div>
		</div>
		<div id="loading" class="modal" style="display:flex;">
			<div class="modal-content-inactive"><h1 id="loading-text">Deckbuilding...<h1></div>
		</div>
		<div id="menu" class="modal">
			<div id="menucontent" class="modal-content-inactive">
				<span onclick="$('#menu').css('display','none');" class="close-cross">X</span>
				<h1>Chiriboga</h1>
				<button id="exittomenu" onclick="window.location.href='index.html';" class="button">Exit to main menu</button>
				<button id="editdeck" onclick="window.location.href='decklauncher.html';" class="button">Edit this deck</button>
				<button onclick="window.location.href='decklauncher.html';" class="button">Edit new random deck</button>
				<div class="options">
					<label for="narration"><input type="checkbox" id="narration">Narrate AI (experimental)</label>
				</div>
				<p>Chiriboga implements the game <a href="https://nisei.net/about/netrunner/">Android: Netrunner</a> with an AI opponent. Source is <a href="https://github.com/bobtheuberfish/chiriboga">available on github</a>.</p>
				<p>Includes all cards in NISEI's <a href="https://nisei.net/products/system-gateway/">System Gateway</a> set. Card front art is the property of NISEI.<br/>
				Includes <a href="https://nisei.net/about/nisei-visual-assets/">game symbols permitted for use by NISEI</a> under CC BY-ND 4.0.<br/>
				Chiriboga is not endorsed by NISEI.</p>
				<p class="acknowledgements">Special thanks to testers, including: <em>BadEpsilon, bowlsley, D-Smith, eniteris, Mentlegen, saff, Saintis, Ysengrin</em>.</p>
				<p class="disclaimer">Netrunner and Android are trademarks of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC.<br/>
				Chiriboga is not affiliated with Fantasy Flight Games or Wizards of the Coast.</p>
				<p><a href="https://netrunnerdb.com/en/card/26098"><em>...but who ordered him to wear that hat?</em></a></p>
				<button onclick="DownloadCapturedLog();" class="button">Download captured log</button> (for <a href="https://github.com/bobtheuberfish/chiriboga/issues">error reporting</a>)
				<br/><br/>
			</div>
		</div>
	</body>
</html>