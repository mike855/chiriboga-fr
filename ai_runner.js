//AI decisionmaking

class RunnerAI {
  _log(message) {
    //just comment this line to suppress AI log
    console.log("AI: " + message);
  }

  _installWouldExceedMU(card) {
    if (typeof card.memoryCost === "undefined") return false;

    //loop through install options. return false as soon as an option is found that doesn't exceed mu budget
    var choices = ChoicesCardInstall(card, true); //true ignores credit cost);
    for (var i = 0; i < choices.length; i++) {
      var destination = null;
      if (typeof card.host !== "undefined") destination = host;
      if (
        card.memoryCost + InstalledMemoryCost(destination) <=
        MemoryUnits(destination)
      )
        return false;
    }
    return true;
  }

  _copyOfCardExistsIn(title, cards, exclude = []) {
    for (var i = 0; i < cards.length; i++) {
      if (GetTitle(cards[i]) == title && !exclude.includes(cards[i]))
        return cards[i];
    }
    return null;
  }

  _uniqueCopyAlreadyInstalled(
    card //returns true if is unique and a copy already installed
  ) {
    if (!card.unique) return false; //i.e. .unique == false or undefined
    var installedCards = InstalledCards(card.player);
    for (var i = 0; i < installedCards.length; i++) {
      if (
        installedCards[i] !== card &&
        GetTitle(installedCards[i]) == GetTitle(card)
      )
        return true;
    }
    return false;
  }

  _installedCardExistsWithSubType(subtype) {
    var installedRunnerCards = InstalledCards(runner);
    for (var i = 0; i < installedRunnerCards.length; i++) {
      if (CheckSubType(installedRunnerCards[i], subtype)) return true;
    }
    return false;
  }

  _wastefulToInstall(card) {
    if (this._uniqueCopyAlreadyInstalled(card)) return true;
    if (this._installWouldExceedMU(card)) return true;
    if (
      CheckSubType(card, "Fracter") &&
      this._installedCardExistsWithSubType("Fracter")
    )
      return true;
    if (
      CheckSubType(card, "Decoder") &&
      this._installedCardExistsWithSubType("Decoder")
    )
      return true;
    if (
      CheckSubType(card, "Killer") &&
      this._installedCardExistsWithSubType("Killer")
    )
      return true;
    if (
      CheckSubType(card, "AI") &&
      (this._essentialBreakerTypesNotInHandOrArray(InstalledCards(runner))
        .length == 0 ||
        this._installedCardExistsWithSubType("AI"))
    )
      return true;
    return false;
  }

  _wastefulToPlay(card) {
    if (card.title == "Creative Commission" && runner.clickTracker == 2)
      return true;
    return false;
  }

  //check if a matching type breaker is installed (or AI)
  _matchingBreakerIsInstalled(iceCard) {
    var installedRunnerCards = InstalledCards(runner);
    for (var i = 0; i < installedRunnerCards.length; i++) {
      if (CheckSubType(installedRunnerCards[i], "Icebreaker")) {
        if (BreakerMatchesIce(installedRunnerCards[i], iceCard)) return true;
      }
    }
    return false;
  }

  //creates three groupings: ice, asset/agenda/upgrade, and operation
  _combinedCardType(str) {
    if (str == "agenda") return "asset";
    if (str == "upgrade") return "asset";
    return str;
  }

  //get cached potential or zero
  _getCachedPotential(server, allowRecalculate = true) {
    var result = 0;
    for (var i = 0; i < this.cachedPotentials.length; i++) {
      if (this.cachedPotentials[i].server == server)
        return this.cachedPotentials[i].potential;
    }
    return result;
  }

  //get cached complete run cost or Infinity
  _getCachedCost(server) {
    if (!this.runsEverCalculated.includes[server])
      this._calculateBestCompleteRun(server, 0, 0, 0);
    var result = Infinity;
    for (var i = 0; i < this.cachedCosts.length; i++) {
      if (this.cachedCosts[i].server == server) return this.cachedCosts[i].cost;
    }
    return result;
  }

  //this function also includes known agendas that would be accessed
  _countNewCardsThatWouldBeAccessedInRnD(depth) {
    var ret = 0;
    for (var i = corp.RnD.cards.length - 1; i > -1; i--) {
      if (
        !corp.RnD.cards[i].knownToRunner ||
        corp.RnD.cards[i].cardType == "agenda"
      )
        ret += 1;
      depth--;
      if (depth == 0) return ret; //no more cards to access
    }
    return ret; //reached bottom of R&D
  }

  constructor() {
    this.preferred = null;
    this.cardsWorthKeeping = [];
    this.runsEverCalculated = []; //used to check whether calculation is needed to return cachedCost
    this.cachedCosts = []; //for all servers, updated each time a *complete* run is calculated
    this.cachedPotentials = []; //for all servers, calculated each time "run" action is available
    this.cachedBestPath = null; //just for the most recently calculated server
    this.cachedComplete = false; //indicates whether or not cachedBestPath represents a complete or incomplete path
	this.cachedPathServer = null; //to remember which server cachedBestPath applies to
    this.rc = new RunCalculator();
    this.serverList = [];

    this.suspectedHQCards = []; //each is a { title, cardType, copies, uncertainty } object

    //teach the AI about cards (in order of priority, best first or better order of play)
    this.economyPlay = ["Sure Gamble", "Creative Commission", "Wildcat Strike"]; //cards which can be played to gain credits
    this.economyInstall = [
      "Pennyshaver",
      "Telework Contract",
      "Smartware Distributor",
      "DZMZ Optimizer",
      "Fermenter",
      "Red Team",
      "Pantograph",
    ]; //cards which can be installed to gain credits
    this.economyTrigger = [
      "Telework Contract",
      "Fermenter",
      "Smartware Distributor",
      "Pennyshaver",
    ]; //cards which can be triggered to gain credits
    this.drawInstall = ["Verbal Plasticity"]; //cards which can be installed to draw cards
  }

  //functions to use/gain/lose info about cards in HQ
  _storedInfoAboutHQCards(
    title //returns index in this.suspectedHQCards (or -1)
  ) {
    for (var i = 0; i < this.suspectedHQCards.length; i++) {
      if (this.suspectedHQCards[i].title == title) return i;
    }
    return -1;
  }
  _infoHQScore() { //a vague heuristic used to determine how well HQ is known (roughly equivalent to a count of known cards in HQ)
    var ret = 0;
    for (var i = 0; i < this.suspectedHQCards.length; i++) {
      ret +=
        this.suspectedHQCards[i].copies *
        (1.0 - this.suspectedHQCards[i].uncertainty);
    }
    //debug log
    var debugoutput = "Suspected HQ: ";
    for (var i = 0; i < this.suspectedHQCards.length; i++) {
      debugoutput +=
        "[" +
        this.suspectedHQCards[i].copies +
        " " +
        this.suspectedHQCards[i].title +
        ", " +
        (1.0 - this.suspectedHQCards[i].uncertainty).toFixed(1) +
        " certainty]";
    }
    debugoutput += " (info HQ score: " + ret.toFixed(1) + ")";
    this._log(debugoutput);
    return ret;
  }
  GainInfoAboutHQCard(
    card //called when a known card is moved into HQ
  ) {
    var indexOfEntry = this._storedInfoAboutHQCards(card.title);
    if (indexOfEntry < 0)
      this.suspectedHQCards.push({
        title: card.title,
        cardType: card.cardType,
        copies: 1,
        uncertainty: 0,
      });
    else {
      this.suspectedHQCards[indexOfEntry].copies++;
      this.suspectedHQCards[indexOfEntry].uncertainty *= 0.5; //average between certain and whatever the other cards are (this is fairly arbitrary)
    }
  }
  GainInfoAboutHQCards(
    cards //called with the access list when access list is created
  ) {
    if (corp.HQ.cards.length < 1) return; //this shouldn't happen but it's here to avoid divide by zero

    //uncertainty depends on cards being seen vs cards in HQ and is between 0 (certain) and 1 (impossible)
    var uncertainty =
      (corp.HQ.cards.length - cards.length) / corp.HQ.cards.length;
    if (cards.length == corp.HQ.cards.length) this.suspectedHQCards = []; //simplest case is if all cards are viewed at once

    //count the number of each title in the input
    var counts = {};
    for (var i = 0; i < cards.length; i++) {
      if (counts[cards[i].title]) counts[cards[i].title]++;
      else counts[cards[i].title] = 1;
    }

    //whenever the count exceeds the number known, update the entry
    //if that card title hasn't been seen yet, add the entry
    for (var i = 0; i < cards.length; i++) {
      var indexOfEntry = this._storedInfoAboutHQCards(cards[i].title);
      if (indexOfEntry < 0)
        this.suspectedHQCards.push({
          title: cards[i].title,
          cardType: cards[i].cardType,
          copies: counts[cards[i].title],
          uncertainty: 0,
        });
      //the card is definitely there, we're looking at it
      else {
        //multi-access may create a confident count
        if (
          counts[cards[i].title] > this.suspectedHQCards[indexOfEntry].copies
        ) {
          this.suspectedHQCards[indexOfEntry].copies = counts[cards[i].title];
          if (uncertainty < this.suspectedHQCards[indexOfEntry].uncertainty)
            this.suspectedHQCards[indexOfEntry].uncertainty = uncertainty; //may become more certain, based on this fresh information
        }
        //otherwise maybe there are more copies
        else {
          //calculate the chances of there being the another copy (basically just the fraction of unknown hand over total hand size)
          var chances =
            (corp.HQ.cards.length - this._infoHQScore()) / corp.HQ.cards.length;
          var u_added = 1.0 - chances;
          var u_original = this.suspectedHQCards[indexOfEntry].uncertainty;
          var c_original = this.suspectedHQCards[indexOfEntry].copies;
          //update uncertainty to take into account both old uncertainty and the chances there actually is another of the same
          this.suspectedHQCards[indexOfEntry].uncertainty =
            (u_original * c_original + u_added) / (1.0 + c_original);
          this.suspectedHQCards[indexOfEntry].copies++;
        }
      }
    }
  }
  LoseInfoAboutHQCards(
    card,
    cardType = "" //note: just one card at a time
  ) //called when a card is rezzed in Rez(), played in Play(), stolen/scored in Steal()/Score(), trashed from HQ in Trash(), or installed (null input) in Install()
  //if cardType is 'ice' for null card, ice cards will gain uncertainty and non-ice will lose uncertainty (and vice-versa for 'non-ice')
  {
    //this approach is far from perfect (e.g. if knowledge is reset and then an already installed card is stolen, it could remove critical knowledge) but this may still be sufficient

    if (corp.HQ.cards.length == 0) {
      //since the card triggers fire after the move is made, if HQ has become empty we can clear the knowledge stack
      this.suspectedHQCards = [];
    } else if (card) {
      //known cards will reduce number known (remove entry if zero) but will not change certainty
      var indexOfEntry = this._storedInfoAboutHQCards(card.title);
      if (indexOfEntry > -1) {
        this.suspectedHQCards[indexOfEntry].copies -= 1;
        if (this.suspectedHQCards[indexOfEntry].copies <= 0)
          this.suspectedHQCards.splice(indexOfEntry, 1);
      }
    } //null cards will increase uncertainty of relevant knowns but will not change specific counts
    else {
      //this could be improved e.g. by calculating total suspected amount of cards of that type in HQ
      for (var i = 0; i < this.suspectedHQCards.length; i++) {
        var typeMatches = true; //by default, become more uncertain
        //we exempt operations from this rule because we assume installing (hence knowing the type)
        if (
          cardType !== "" &&
          this._combinedCardType(this.suspectedHQCards[i].cardType) !==
            this._combinedCardType(cardType)
        )
          typeMatches = false;
        if (typeMatches) {
          if (this.suspectedHQCards[i].uncertainty == 0)
            this.suspectedHQCards[i].uncertainty =
              1.0 / (1.0 + corp.HQ.cards.length);
          else
            this.suspectedHQCards[i].uncertainty *=
              1.0 - 1.0 / (1.0 + corp.HQ.cards.length);
        }
      }
    }
  }

  //not currently being used, but not deleted because might need it later
  _phaseCallback(optionList, choiceType) {
    //console.log(currentPhase.identifier);
  }

  //sets this.preferred to prefs and returns indexOf cmd in optionList
  //don't forget to return the result!
  _returnPreference(optionList, cmd, prefs) {
    prefs.command = cmd;
    this.preferred = prefs;
    if (optionList.indexOf(cmd) > -1) return optionList.indexOf(cmd);
    else if (optionList.indexOf("n") > -1) return optionList.indexOf("n"); //cmd might be coming up next phase
    LogError(
      'returnPreference failed to find "' +
        cmd +
        '" in this optionList with these prefs:'
    );
    console.log(optionList);
    console.log(prefs);
    return 0; //arbitrary
  }

  //meta-wrappers for run calculator (all return the best path or null if no path found)

  //for efficiency, use cached path unless none is available
  _cachedOrBestRun(server, startIceIdx) {
	  if (!this.cachedBestPath || this.cachedPathServer !== server) { //need to recalculate
		//ideally complete runs
		this._calculateBestCompleteRun(server, 0, 0, 0, startIceIdx);  //0 means no credit/click/damage offset
		//but if not, use an exit strategy (incomplete run)
		if (!this.cachedBestPath)
		  this._calculateBestExitStrategy(server, 0, 0, 0, startIceIdx);  //0 means no credit/click/damage offset
	  } else {
		  //remove ice before this one
		  for (var i=this.cachedBestPath.length-1; i>-1; i--) {
			if (this.cachedBestPath[i].iceIdx > startIceIdx) this.cachedBestPath.splice(i,1);
		  }
	  }
	  return this.cachedBestPath;
  }

  _calculateBestCompleteRun(
    server,
    creditOffset,
    clickOffset,
    damageOffset,
    startIceIdx
  ) {
    return this._calculateRunPath(
      server,
      creditOffset,
      clickOffset,
      damageOffset,
      false,
      startIceIdx
    ); //false means don't include incomplete runs
  }
  _calculateBestExitStrategy(
    server,
    creditOffset,
    clickOffset,
    damageOffset,
    startIceIdx
  ) {
    return this._calculateRunPath(
      server,
      creditOffset,
      clickOffset,
      damageOffset,
      true,
      startIceIdx
    ); //true means include incomplete runs
  }

  //wrapper for run calculator (returns null if no path found)
  _calculateRunPath(
    server,
    creditOffset,
    clickOffset,
    damageOffset,
    incomplete,
    startIceIdx
  ) {
	//console.error("crp "+ServerName(server)+(incomplete?" incomplete":" complete"));
    var clickLimit = runner.clickTracker + clickOffset;
    var creditLimit = AvailableCredits(runner) + creditOffset;
    var damageLimit = runner.grip.length + damageOffset; //(this gets updated during the run calculation if clickLimit is used up)
    //this works because potentials are calculated before costs in (optionList.includes("run")). Note the false here prevents an infinite loop
    if (this._getCachedPotential(server, false) < 2.0)
      damageLimit -= this.cardsWorthKeeping.length; //the 2.0 is arbitrary but basically don't risk stuff for lowish potential
    if (damageLimit < 0) damageLimit = 0;
	var tagLimit =
      Math.min(clickLimit, Math.floor(creditLimit * 0.5)) - runner.tags; //allow 1 tag for each click+2[c] remaining but less if tagged (this gets updated during the run calculation)
    if (tagLimit < 0) tagLimit = 0;
    var paths = this.rc.Calculate(
      server,
      clickLimit,
      creditLimit,
      damageLimit,
      clickLimit,
      creditLimit,
      tagLimit,
      incomplete,
      startIceIdx
    );
    this.cachedBestPath = null; //by default assume no paths were found
    this.cachedComplete = !incomplete;
	this.cachedPathServer = server;
    if (!this.runsEverCalculated.includes(server))
      this.runsEverCalculated.push(server);
    //update/store cached cost
    var bestpath = [];
    if (paths.length > 0) {
		bestpath = paths[paths.length - 1];
		this.cachedBestPath = bestpath;
	}
    var bestcost = Infinity;
    if (bestpath.length > 0) {
      if (typeof bestpath[bestpath.length - 1].cost !== "undefined")
        bestcost = bestpath[bestpath.length - 1].cost;
      else bestcost = this.rc.PathCost(bestpath);
    }
    var alreadyCached = false; //or consider maybe only updating cached cost for complete runs?
    for (var i = 0; i < this.cachedCosts.length; i++) {
      if (this.cachedCosts[i].server == server) {
        this.cachedCosts[i].cost = bestcost;
        alreadyCached = true;
      }
    }
    if (!alreadyCached)
      this.cachedCosts.push({ server: server, cost: bestcost });
    return this.cachedBestPath;
  }

  //returns something between [] and ["Fracter","Decoder","Killer"]
  _essentialBreakerTypesNotInArray(installedRunnerCards) {
    var breakersInstalled = [];
    for (var j = 0; j < installedRunnerCards.length; j++) {
      if (CheckSubType(installedRunnerCards[j], "Icebreaker"))
        breakersInstalled.push(installedRunnerCards[j]);
    }
    var breakerTypes = ["Fracter", "Decoder", "Killer"];
    var result = [];
    for (var j = 0; j < breakerTypes.length; j++) {
      //if this breaker type is not already installed, add it to result
      var alreadyHaveOne = false;
      for (var k = 0; k < breakersInstalled.length; k++) {
        if (CheckSubType(breakersInstalled[k], breakerTypes[j])) {
          alreadyHaveOne = true;
          break;
        }
      }
      if (!alreadyHaveOne) result.push(breakerTypes[j]);
    }
    return result;
  }

  //returns something between [] and ["Fracter","Decoder","Killer"]
  _essentialBreakerTypesNotInHandOrArray(installedRunnerCards) {
    var breakersInHandOrInstalled = [];
    for (var j = 0; j < installedRunnerCards.length; j++) {
      if (CheckSubType(installedRunnerCards[j], "Icebreaker"))
        breakersInHandOrInstalled.push(installedRunnerCards[j]);
    }
    for (var j = 0; j < runner.grip.length; j++) {
      if (CheckSubType(runner.grip[j], "Icebreaker"))
        breakersInHandOrInstalled.push(runner.grip[j]);
    }
    var breakerTypes = ["Fracter", "Decoder", "Killer"];
    var result = [];
    for (var j = 0; j < breakerTypes.length; j++) {
      //if this breaker type is not already in hand or installed, add it to result
      var alreadyHaveOne = false;
      for (var k = 0; k < breakersInHandOrInstalled.length; k++) {
        if (CheckSubType(breakersInHandOrInstalled[k], breakerTypes[j])) {
          alreadyHaveOne = true;
          break;
        }
      }
      if (!alreadyHaveOne) result.push(breakerTypes[j]);
    }
    return result;
  }

  //returns the first card found fulfilling this description (or an AI if needed, or null if none found)
  _icebreakerInStackNotInHandOrArray(installedRunnerCards) {
    var essentialBreakerTypesNotInHandOrArray =
      this._essentialBreakerTypesNotInHandOrArray(installedRunnerCards);
    for (var j = 0; j < essentialBreakerTypesNotInHandOrArray.length; j++) {
      //need one, is there one in deck?
      for (var k = 0; k < runner.stack.length; k++) {
        if (
          CheckSubType(
            runner.stack[k],
            essentialBreakerTypesNotInHandOrArray[j]
          )
        ) {
          return runner.stack[k];
        }
      }
    }
    //we eeed one but couldn't find it - maybe get an AI instead
    if (essentialBreakerTypesNotInHandOrArray.length > 0) {
      for (var k = 0; k < runner.stack.length; k++) {
        if (CheckSubType(runner.stack[k], "AI")) {
          return runner.stack[k];
        }
      }
    }
    return null;
  }

  _cardsInHandWorthKeeping() {
    //subtypes to ideally have at least one of each installed:
    var atLeastOne = ["Console", "Fracter", "Decoder", "Killer"]; //list of subtypes desired
    //loop through installed runner cards - if any have this subtype then it can be removed from the list
    //could use the _installedCardExistsWithSubType helper function but this custom approach is more efficient here
    var installedRunnerCards = InstalledCards(runner);
    for (var i = 0; i < installedRunnerCards.length; i++) {
      for (var j = atLeastOne.length - 1; j > -1; j--) {
        if (CheckSubType(installedRunnerCards[i], atLeastOne[j]))
          atLeastOne.splice(j, 1);
      }
    }
    //loop through hand to find cards worth keeping
    var ret = [];
    for (var i = 0; i < runner.grip.length; i++) {
      var keep = false;
      var card = runner.grip[i];
      if (!this._wastefulToInstall(card)) {
        //don't overwrite existing unique or exceed mu
        //coded here for now but could include these (or some) in the card definitions instead e.g. AIWorthKeeping

        //some cards are just always worth keeping
        if (card.title == "Sure Gamble") keep = true;
        //some need to be kept for economy
        if (Credits(runner) < 5) {
          //arbitrary
          if (card.title == "Creative Commission") keep = true;
          else if (card.title == "Telework Contract") keep = true;
          else if (card.title == "Fermenter") keep = true;
        }
        //or for card draw
        if (runner.grip.length < 3) {
          //arbitrary
          if (card.title == "VRcation") keep = true;
        }
        //some we desire atLeastOne
        for (var j = 0; j < atLeastOne.length; j++) {
          if (CheckSubType(card, atLeastOne[j])) keep = true;
        }
        //or AI breaker
        if (CheckSubType(card, "AI")) {
          //keep unless all breaker types are already present in grip/programs
          if (
            this._essentialBreakerTypesNotInHandOrArray(installedRunnerCards)
              .length > 0
          )
            keep = true;
        }
        //some we need for MU
        var sparemu = runner._renderOnlyMU;
        if (sparemu < 2) {
          //keep if available mu is 1 or less
          if (
            card.title == "DZMZ Optimizer" ||
            card.title == "T400 Memory Diamond"
          )
            keep = true;
        }
        //or something more specific
        if (card.title == "Cookbook") {
          //keep if any virus cards in hand
          for (var j = 0; j < runner.grip.length; j++) {
            if (CheckSubType(runner.grip[j], "Virus")) {
              keep = true;
              break;
            }
          }
        } else if (card.title == "Mutual Favor") {
          //keep if have a spare mu and a breaker type in deck thats not in hand or play
          if (sparemu > 0) {
            var worthBreaker =
              this._icebreakerInStackNotInHandOrArray(installedRunnerCards);
            if (worthBreaker) {
              //if a successful run has already been made this turn and can afford the install, then Mutual Favor is efficient
              if (
                card.madeSuccessfulRunThisTurn &&
                CheckCredits(InstallCost(worthBreaker), runner, "installing")
              )
                keep = true;
              //otherwise don't Mutual Favor if there's already a breaker in hand worth playing...
              else {
                var essentials =
                  this._essentialBreakerTypesNotInArray(installedRunnerCards);
                var worthBreakersInHand = false;
                for (var j = 0; j < runner.grip.length; j++) {
                  for (var k = 0; k < essentials.length; k++) {
                    if (CheckSubType(runner.grip[j], essentials[k])) {
                      worthBreakersInHand = true;
                      break;
                    }
                  }
                  if (worthBreakersInHand) break;
                }
                if (!worthBreakersInHand) keep = true;
              }
            }
          }
        } else if (card.title == "Docklands Pass") {
          //keep if run into HQ is possible and HQ hasn't been breached this turn
          if (!card.breachedHQThisTurn && runner.clickTracker > 1) {
            var storedCWK = this.cardsWorthKeeping; //oversimplified workaround for the fact that docklands will consider HQ unrunnable if it is in hand and might be lost...
            this.cardsWorthKeeping = [];
            if (this._getCachedCost(corp.HQ) != Infinity) keep = true;
            this.cardsWorthKeeping = storedCWK;
          }
        } else if (card.title == "Conduit") {
          //keep if there is not already a Conduit installed and a run into R&D is possible
          var alreadyConduit = false;
          for (var j = 0; j < runner.rig.programs.length; j++) {
            if (runner.rig.programs[j].title == "Conduit") {
              alreadyConduit = true;
              break;
            }
          }
          if (!alreadyConduit) {
            if (this._getCachedCost(corp.RnD) != Infinity) keep = true;
          }
        }
      }
      if (keep) ret.push(card);
    }
    return ret;
  }

  //returns -1 (low), 0 (neither) or 1 (high) priority
  EstimateCardPriority(card, priorityIceList) {
    //A compatible (but not yet installed) breaker is high priority
    for (var i = 0; i < priorityIceList.length; i++) {
      var iceCard = priorityIceList[i];
      if (PlayerCanLook(runner, iceCard)) {
        if (BreakerMatchesIce(card, iceCard)) {
          //console.log("Matching breaker is " + card.title);
          if (!this._matchingBreakerIsInstalled(iceCard)) return 1;
          //high
          else return -1; //low
        }
      }
    }
    return 0; //neither by default
  }

  //do this right after calculating run costs and priorities
  SortCardsInHandWorthKeeping() {
    //console.log("Sorting: " + JSON.stringify(this.cardsWorthKeeping));
    var high = [];
    var neither = [];
    var low = [];

    //make an ice list (either from the highest priority server or just all ice)
    var priorityIceList = [];
    if (this.serverList.length > 0) {
      //which server is highest priority?
      var highestPotential = this.serverList[0].potential;
      var highestPotentialServer = this.serverList[0].server;
      for (var i = 1; i < this.serverList.length; i++) {
        if (this.serverList[i].potential > highestPotential) {
          highestPotential = this.serverList[i].potential;
          highestPotentialServer = this.serverList[i].server;
        }
      }
      if (highestPotentialServer.ice.length > 0)
        priorityIceList = highestPotentialServer.ice;
    }
    if (priorityIceList.length == 0) {
      var installedCards = InstalledCards(corp);
      for (var i = 0; i < installedCards.length; i++) {
        if (installedCards[i].cardType == "ice")
          priorityIceList.push(installedCards[i]);
      }
    }
    //console.log("Priority ice: " + JSON.stringify(priorityIceList));

    //loop through pushing cards as high (unshift), neither or low (push) priority
    for (var i = 0; i < this.cardsWorthKeeping.length; i++) {
      var priority = this.EstimateCardPriority(
        this.cardsWorthKeeping[i],
        priorityIceList
      );
      if (priority < 0) low.push(this.cardsWorthKeeping[i]);
      else if (priority > 0) high.unshift(this.cardsWorthKeeping[i]);
      else neither.push(this.cardsWorthKeeping[i]);
    }
    this.cardsWorthKeeping = high.concat(neither).concat(low);
    //console.log("Result: " + JSON.stringify(this.cardsWorthKeeping));
  }

  //returns index of choice
  Choice(optionList, choiceType) {
    if (optionList.length < 1) {
      LogError("No valid commands available");
      return;
    }
    //temporary detailed log for troublesome bugs
    /*
console.log("AI making choice from:");
console.log(optionList);
console.log("With identifier="+currentPhase.identifier+" and title="+currentPhase.title+" and preferred=");
console.log(this.preferred);
*/
    //some callbacks fire regardless of whether a decision needs to be made (so AI can keep track of phases)
    this._phaseCallback(optionList, choiceType);

    //check for preferreds
    var ret = -1;
    if (this.preferred !== null) {
      if (choiceType == "command") {
        if (optionList.indexOf(this.preferred.command) > -1)
          return optionList.indexOf(this.preferred.command);
      }

      //special: specific option in specific phase
      if (typeof this.preferred.title !== "undefined") {
        if (this.preferred.title == currentPhase.title) {
          ret = optionList.indexOf(this.preferred.option);
          if (ret > -1) {
            this.preferred = null; //reset (don't reuse the preference)
            return ret;
          }
        }
      }

      //special: try to choose server regardless of phase
      if (typeof this.preferred.chooseServer !== "undefined") {
        for (var i = 0; i < optionList.length; i++) {
          if (optionList[i].server == this.preferred.chooseServer) {
            this.preferred = null; //reset (don't reuse the preference)
            return i;
          }
        }
      }

      //return the optionList index of the preferred option, if found
      //NOTE this will clear preferred, if a relevant preference is found
      if (typeof this.preferred.command !== "undefined") {
        var cmd = this.preferred.command;
        if (executingCommand == cmd) {
          var data = [];
          if (cmd == "run") data = [{ prop: "server", key: "serverToRun" }];
          else if (cmd == "trigger")
            data = [{ prop: "card", key: "cardToTrigger" }];
          else if (cmd == "play") data = [{ prop: "card", key: "cardToPlay" }];
          else if (cmd == "install")
            data = [
              { prop: "card", key: "cardToInstall" },
              { prop: "host", key: "hostToInstallTo" },
            ];
          //for more examples see ai_corp.js

          if (data.length < 1)
            this._log("process missing for " + cmd + ", so...");
          else {
            //loop through optionList
            //if data includes multiple props/keys then all must match for a hit
            for (var i = 0; i < optionList.length; i++) {
              var matches = 0;
              for (var j = 0; j < data.length; j++) {
                var prop = data[j].prop;
                var key = data[j].key;
                if (typeof this.preferred[key] !== "undefined") {
                  var value = this.preferred[key];
                  if (optionList[i][prop] == value) matches++;
                  if (matches == data.length) {
                    this._log("a relevant preference has been set");
                    if (typeof this.preferred.nextPrefs !== "undefined")
                      this.preferred = this.preferred.nextPrefs;
                    //used saved next preference
                    else this.preferred = null; //reset (don't reuse the preference)
                    return i;
                  }
                }
              }
            }
          }
          LogError(
            "preferred option not matched with this optionList and preferred:"
          );
          console.log(optionList);
          console.log(this.preferred);
          this.preferred = null; //reset (don't reuse the preference)
        }
      }
    }

    if (optionList.length == 1) return 0;

    //*** DECISIONMAKING LOGIC HERE ***

    //used for checks
    var cardToPlay = null;
    var cardToInstall = null;
    var cardToTrigger = null;

    //consider cards-worth-keeping list (to play or to install)
    this.cardsWorthKeeping = this._cardsInHandWorthKeeping();

    //Possibly useful variables include: currentPhase.title, currentPhase.identifier, executingCommand, optionList

    if (currentPhase.identifier == "Runner Mulligan") {
      if (this.cardsWorthKeeping.length < 1) return 0; //mulligan
      return 1; //by default, not mulligan
    }

    if (executingCommand == "discard") {
      for (var i = 0; i < optionList.length; i++) {
        if (!this.cardsWorthKeeping.includes(optionList[i].card)) {
          this._log("I guess I didn't really need this");
          return i;
        }
      }
      return 0; //wish could keep all, but no choice
    }

    if (optionList.includes("remove")) {
      return optionList.indexOf("remove"); //by default remove
    }

    if (optionList.includes("jack")) {
      if (currentPhase.identifier == "Run 4.3" && approachIce == 0) {
        //past last ice, choosing whether to approach server
        //edge case: if Conduit is trashed during the run
        for (var i = 0; i < runner.heap.length; i++) {
          if (runner.heap[i].title == "Conduit") {
            if (runner.heap[i].runningWithThis) {
              runner.heap[i].runningWithThis = false;
              if (corp.RnD.cards[corp.RnD.cards.length - 1].knownToRunner)
                return optionList.indexOf("jack"); //jack out, the top card is already known
            }
          }
        }
        return optionList.indexOf("n"); //by default approach server
      }

      //calculate complete run path from this point
	  this._cachedOrBestRun(attackedServer, approachIce - 1);
      if (!this.cachedBestPath || !this.cachedComplete) return optionList.indexOf("jack"); //we won't make it to the server, bail out instead
      return optionList.indexOf("n"); //by default don't jack out
    }

    if (currentPhase.identifier == "Run Accessing") {
      //accessing a card
      //listed in order of preference
      if (optionList.includes("steal")) return optionList.indexOf("steal");
      if (optionList.includes("trash")) {
        //don't trash installed ambushes
        if (
          CheckSubType(accessingCard, "Ambush") &&
          CheckInstalled(accessingCard) &&
          optionList.includes("n")
        )
          return optionList.indexOf("n");
        //trash everything else, though
        return optionList.indexOf("trash");
      }
      if (optionList.includes("trigger")) return optionList.indexOf("trigger");
      if (optionList.includes("n")) return optionList.indexOf("n");
	  //otherwise just choose next card
	  return 0;
    }

    if (currentPhase.identifier == "Run Subroutines") {
      //subroutines have choices to be made
      //console.log("AI subroutine decision");
      //console.log(optionList);
	  this._cachedOrBestRun(attackedServer, approachIce);
      if (this.cachedBestPath) {
        //requires a path to exist (whether complete or not)
		var bestpath = this.cachedBestPath;
		//the first point for the next ice (i.e. approachIce - 1) contains sr choice for this ice (the 'when moving on' decisions)
		var p = null;
		for (var i=0; i<bestpath.length; i++) {
			if (bestpath[i].iceIdx == approachIce - 1) {
				p = bestpath[i];
				break;
			}
		}
		if (p) {
          if (p.alt) {
            //if no choice data stored, dunno!
            //console.log(subroutine);
            //console.log(p.alt);
            //find the right subroutine
            for (var i = 0; i < p.alt.length; i++) {
              if (p.alt[i].srIdx == subroutine - 1) return p.alt[i].choiceIdx; //subroutine has incremented because it fired
            }
            console.error(
              "No .alt for sr " + (subroutine - 1) + "? " + JSON.stringify(bestpath)
            );
          } else console.error("No cached path .alt? " + JSON.stringify(bestpath));
        }
      }
      this._log("No acceptable path found, seeking etr");
      var sroptions = this.rc.IceAI(
        GetApproachEncounterIce(),
        AvailableCredits(corp)
      ).sr[subroutine - 1];
      for (var i = 0; i < sroptions.length; i++) {
        if (sroptions[i].includes("endTheRun")) return i;
      }
      this._log("No etr found, avoiding tags");
      for (var i = 0; i < sroptions.length; i++) {
        if (!sroptions[i].includes("tag")) return i;
      }
      //console.log("no good!");
    }

    if (currentPhase.identifier == "Run 3.1") {
      //mid-encounter
      //console.log("Mid-encounter bestpath:");
      //calculate run path from this point (the 0s mean no credit/click/damage offset)
      //ideally complete runs
      //but if not, use an exit strategy (incomplete run)
	  this._cachedOrBestRun(attackedServer, approachIce);
      var bestpath = [];
      if (this.cachedBestPath) {
        bestpath = this.cachedBestPath;
        //console.log(optionList);

        //console.log("approachIce = "+approachIce);
        //console.log("subroutine = "+subroutine);
		//console.log(JSON.stringify(bestpath));
		//the last point for this ice has all the info in it (and the first point is the start of encounter)
		var p = null;
		for (var i=bestpath.length-1; i>0; i--) {
			if (bestpath[i].iceIdx == approachIce) {
				p = bestpath[i];
				break;
			}
		}
		if (p != null) {
			if (optionList.includes("trigger") && ((p.card_str_mods.length > 0)||(p.sr_broken.length > 0)) ) {
			  //console.log("trigger");
			  //console.log(p);
			  //e.g. str up and break srs
			  //for now assume there will only be one ability possible for this card, so we just prefer the card
			  //we need to check iceIdx here in case there are persists (don't retrigger them)
			  if (p.card_str_mods.length > 0 && p.card_str_mods[0].iceIdx == approachIce) {
				return this._returnPreference(optionList, "trigger", {
				  cardToTrigger: p.card_str_mods.splice(0,1)[0].use, //assumes they are added to the array in order of use, discard immediately
				});
			  }
			  else if (p.sr_broken.length > 0) {
				return this._returnPreference(optionList, "trigger", {
				  cardToTrigger: p.sr_broken[0].use, //assumes they are added to the array in order of use, keep for sr choice
				});
			  }
			  //nothing specified, don't use abilities
			  if (optionList.includes("n")) {
				  return optionList.indexOf("n");
			  }
			} else if (p.sr_broken.length > 0) {
			  //assume choosing which subroutine to break (note that multiple breaks, even with one ability, are listed separately)
			  //console.log("break");
			  //console.log(p);
			  var ice = GetApproachEncounterIce();
			  if (ice) {
				//the index in the sr array is not necessarily the index in the optionList e.g. if sr[1] is broken then options are [0,2] and index 2 will fail
				var sridx = p.sr_broken.splice(0,1)[0].idx; //assumes they are added to the array in order of use, discard immediately
				var sr = ice.subroutines[sridx];
				for (var i = 0; i < optionList.length; i++) {
				  if (optionList[i].subroutine == sr) return i;
				}
			  }
			}
			//game is asking for something unanticipated. if this happens, investigate.
			if (!optionList.includes("trigger")) {
				console.error("Something went wrong during path resolution");
				console.log(JSON.stringify(p));
				console.log(JSON.stringify(optionList));
			}
		}
		//nothing specified, do nothing
		if (optionList.includes("n")) return optionList.indexOf("n");
      }
	  //no path exists? this shouldn't happen so swing wildly
      if (optionList.includes("trigger")) return optionList.indexOf("trigger"); //by default, trigger abilities if possible
    }

    if (currentPhase.identifier == "Run 5.2" && executingCommand == "access") {
      //breaching, choose access order
      for (var i = 0; i < optionList.length; i++) {
        if (optionList[i].card.knownToRunner || optionList[i].card.rezzed) {
          //if any are known upgrades, access that first
          if (optionList[i].card.cardType == "upgrade") return i;
          //otherwise it's a known non-upgrades, access any other card first i.e. any upgrade
          else {
            if (i == 0) return 1;
            return 0;
          }
        }
      }
	  //otherwise just choose next card
	  return 0;
    }

    //if run is an option, assess the possible runs
    if (optionList.includes("run")) {
      //keep track of extra potential from trigger abilities
      var useRedTeam = null;
      var useConduit = null;
      if (optionList.includes("trigger")) {
        var triggerChoices = ChoicesTriggerableAbilities(runner, "click");
        for (var i = 0; i < triggerChoices.length; i++) {
          if (triggerChoices[i].card.title == "Red Team")
            useRedTeam = triggerChoices[i].card;
          else if (triggerChoices[i].card.title == "Conduit")
            useConduit = triggerChoices[i].card;
        }
      }

      //go through all the servers
      this.serverList = [
        { server: corp.HQ },
        { server: corp.RnD },
        { server: corp.archives },
      ];
      this.cachedPotentials = []; //store potentials for other use
      this.cachedCosts = []; //clear costs too
      for (var i = 0; i < corp.remoteServers.length; i++) {
        this.serverList.push({ server: corp.remoteServers[i] });
      }
      for (var i = 0; i < this.serverList.length; i++) {
        var server = this.serverList[i].server;
        //determine potential value
        this.serverList[i].potential = 0;
        if (typeof server.cards !== "undefined") {
          //i.e., is central
          if (server.cards.length > 0) {
            this.serverList[i].potential = 1;
            //if top card of R&D is already known, no need to run it
            if (
              server == corp.RnD &&
              server.cards[server.cards.length - 1].knownToRunner
            ) {
              if (server.cards[server.cards.length - 1].cardType !== "agenda")
                this.serverList[i].potential = 0;
            } else if (server == corp.RnD) {
              this.serverList[i].potential = 1.0; //arbitrary number
              //make it worth a bit more if HQ is empty
              if (corp.HQ.cards.length == 0) this.serverList[i].potential = 1.5; //arbitrary number
            } else if (server == corp.archives) {
              //the more facedown cards, the more potential
              var faceDownCardsInArchives = 0;
              for (var j = 0; j < corp.archives.cards.length; j++) {
                if (!PlayerCanLook(runner, corp.archives.cards[j]))
                  faceDownCardsInArchives++;
              }
              this.serverList[i].potential = 0.2 * faceDownCardsInArchives; //the 0.2 is arbitrary
            } //server == corp.HQ
            else {
              //the less you know, the more potential
              //HQ potential = multiplier * approx chance of seeing a new card
              //console.log("("+corp.HQ.cards.length+" - "+this._infoHQScore()+") / "+corp.HQ.cards.length);
              this.serverList[i].potential =
                (1.0 * (corp.HQ.cards.length - this._infoHQScore())) /
                corp.HQ.cards.length; //the multiplier is arbitrary
              //although if there are known agendas, bump the potential up
              for (var j = 0; j < this.suspectedHQCards.length; j++) {
                if (
                  this.suspectedHQCards[j].cardType == "agenda" &&
                  this.suspectedHQCards[j].uncertainty == 0
                )
                  this.serverList[i].potential += 1; //the 1 is arbitrary
              }
              //special case: if Docklands would fire
              if (corp.HQ.cards.length > 1) {
                var docklands = this._copyOfCardExistsIn(
                  "Docklands Pass",
                  runner.rig.hardware
                );
                if (docklands) {
                  if (
                    !docklands.breachedHQThisTurn &&
                    this.serverList[i].potential > 0
                  )
                    this.serverList[i].potential += 0.5; //extra potential for that 1 bonus card (but no extra potential if none to start with)
                }
              }
              //if there's just one card and it's unknown then there must be some potential
              if (
                this.serverList[i].potential < 0.5 &&
                corp.HQ.cards.length == 1 &&
                this._infoHQScore() < 0.5
              )
                this.serverList[i].potential = 0.5;
            }
          }
          if (useRedTeam) {
            //might get a little credit from this (the 0.5 is arbitrary)
            if (!useRedTeam.runHQ && server == corp.HQ)
              this.serverList[i].potential += 0.5;
            else if (!useRedTeam.runRnD && server == corp.RnD)
              this.serverList[i].potential += 0.5;
            else if (!useRedTeam.runArchives && server == corp.archives)
              this.serverList[i].potential += 0.5;
          }
          if (useConduit && server == corp.RnD) {
            //extra potential the deeper you can dig (except cards already known)
            var conduitDepth = Counters(useConduit, "virus") + 1;
            var conduitBonusCards =
              this._countNewCardsThatWouldBeAccessedInRnD(conduitDepth);
            if (conduitBonusCards > 0) {
              //only use it if it gives a benefit (it still gains counters from runs with other cards either way)
              this.serverList[i].potential += conduitBonusCards - 1;
            } else useConduit = null;
            if (conduitDepth < corp.RnD.length)
              this.serverList[i].potential += 0.5; //arbitrary, for being able to gain virus counters (ignore if dig reaching the bottom of R&D)
          }
        } //remote
        else {
          this.serverList[i].potential = 0; //empty has no potential
          //first and most obvious (but probably unlikely) is if an agenda is known to be there e.g. was prevented from stealing it last time it was run
          for (var j = 0; j < server.root.length; j++) {
            if (PlayerCanLook(runner, server.root[j])) {
              if (server.root[j].cardType == "agenda")
                this.serverList[i].potential +=
                  server.root[j].agendaPoints + 1.0;
              //the constant is arbitrary
              else if (server.root[j].title == "Clearinghouse")
                this.serverList[i].potential += Math.max(
                  1.0,
                  Counters(server.root[j], "advancement")
                );
              //serious danger
              else {
                //assume everything else isn't worth the effort except if there's credits on it or it's unrezzed econ
                if (!server.root[j].rezzed) {
                  //the constant is arbitrary
                  if (server.root[j].title == "Regolith Mining License")
                    this.serverList[i].potential += 1.0;
                  if (server.root[j].title == "Nico Campaign")
                    this.serverList[i].potential += 1.0;
                } else
                  this.serverList[i].potential +=
                    0.1 * Counters(server.root[j], "credits"); //the multiplier is arbitrary
              }
            } //not known to runner
            else {
              var advancement = Counters(server.root[j], "advancement");
              if (advancement > 3) this.serverList[i].potential += 1.5;
              //this value is arbitrary. After all it could be an agenda, or urtica, or clearinghouse...
              else if (advancement > 0) this.serverList[i].potential += 5.0;
              //this value is arbitrary. But this is the best time to find out before it is advanced more!
              else this.serverList[i].potential += 1.0; //possibly nothing (as above, the number is arbitrary)
            }
          }
        }
        this.cachedPotentials.push({
          server: this.serverList[i].server,
          potential: this.serverList[i].potential,
        }); //store potential for other use (costs are cached in _calculateRunPath)
        //console.log(this.cachedPotentials[this.cachedPotentials.length-1].server.serverName+": "+this.cachedPotentials[this.cachedPotentials.length-1].potential);
        //and calculate best path
        var bestpath = null;
        this.serverList[i].useOverclock = null; //the overclock card to use. If null, don't or can't use.
        if (optionList.includes("play")) {
          if (this.serverList[i].potential > 1.5) {
            //save Overclock for high value targets
            this.serverList[i].useOverclock = this._copyOfCardExistsIn("Overclock", runner.grip);
            if (this.serverList[i].useOverclock) {
              if (!FullCheckPlay(this.serverList[i].useOverclock)) this.serverList[i].useOverclock = null;
            }
          }
        }
        if (this.serverList[i].useOverclock)
          bestpath = this._calculateBestCompleteRun(server, 4, -1, -1);
        //Overclock effectively gives 4 extra credits, a click is needed to play it, and a card slot (reduce max damage by 1)
        else bestpath = this._calculateBestCompleteRun(server, 0, -1, 0); //assume 1 click will be used to initiate the run
        this.serverList[i].bestpath = bestpath;
        this.serverList[i].bestcost = Infinity;
        if (bestpath && bestpath.length > 0) {
          if (typeof bestpath[bestpath.length - 1].cost !== "undefined") //end point of path has total cost
            this.serverList[i].bestcost = bestpath[bestpath.length - 1].cost;
          else this.serverList[i].bestcost = this.rc.PathCost(bestpath);
        }
      }

      //check for inaccessible high-potential servers that might become accessible with some prep
      for (var i = 0; i < this.serverList.length; i++) {
        //add a bit of jitter to make the runner less predictable
        this.serverList[i].potential += 0.2 * Math.random() - 0.1;

        //now check
        if (
          this.serverList[i].potential > 2 &&
          this.serverList[i].bestcost == Infinity
        ) {
          //the 2 is arbitrary
          var server = this.serverList[i].server;
          var clickOffset = -1; //prep
          var creditOffset = 3; //could look at more options depending on what's in hand etc
          var damageOffset = 3; //but for now this at least allows a bit of planning
          //recalculate paths
          var bestpath = null;
          if (this.serverList[i].useOverclock)
            bestpath = this._calculateBestCompleteRun(
              server,
              4 + creditOffset,
              -1 + clickOffset,
              -1 + damageOffset
            );
          //Overclock effectively gives 4 extra credits, a click is needed to play it, and a card slot (reduce max damage by 1)
          else
            bestpath = this._calculateBestCompleteRun(
              server,
              0 + creditOffset,
              -1 + clickOffset,
              0 + damageOffset
            ); //assume 1 click will be used to initiate the run
          if (bestpath) {
            this.serverList = []; //don't run this click
            this._log("Gotta do some prep");
            break;
          }
          //maybe a compatible breaker would help
          if (runner.clickTracker > 1) {
            for (var j = 0; j < server.ice.length; j++) {
              var iceCard = server.ice[j];
              if (PlayerCanLook(runner, iceCard)) {
                if (!this._matchingBreakerIsInstalled(iceCard)) {
                  for (var k = 0; k < this.cardsWorthKeeping.length; k++) {
                    if (
                      CheckSubType(this.cardsWorthKeeping[k], "Icebreaker") &&
                      optionList.includes("install")
                    ) {
                      if (
                        BreakerMatchesIce(this.cardsWorthKeeping[k], iceCard)
                      ) {
                        if (
                          ChoicesCardInstall(this.cardsWorthKeeping[k]).length >
                          0
                        )
                          return this._returnPreference(optionList, "install", {
                            cardToInstall: this.cardsWorthKeeping[k],
                            hostToInstallTo: null,
                          });
                      }
                    } else if (
                      this.cardsWorthKeeping[k].title == "Mutual Favor" &&
                      optionList.includes("play")
                    ) {
                      if (FullCheckPlay(this.cardsWorthKeeping[k])) {
                        return this._returnPreference(optionList, "play", {
                          cardToPlay: this.cardsWorthKeeping[k],
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      //use the server run-estimate information to sort _cardsInHandWorthKeeping
      this.SortCardsInHandWorthKeeping();

      //don't run servers that have too low potential or infinity cost
      for (var i = this.serverList.length - 1; i > -1; i--) {
        if (
          this.serverList[i].potential < 0.5 ||
          this.serverList[i].bestcost == Infinity
        )
          this.serverList.splice(i, 1); //the 0.5 minimum is arbitrary
      }

      //sort for best potential to cost ratio
      this.serverList.sort(function (a, b) {
        //new sort (values potential more)
        if (b.potential > a.potential) return 1; //b is better
        //ignoring cost for now - otherwise too easy to bait runner into pointless runs
        //else if (b.bestcost < a.bestcost) return 1; //b is better
        /* old sort
			if (a.potential/a.bestcost < b.potential/b.bestcost) return 1; //b is better
			else if ((a.bestcost == b.bestcost)&&(a.potential < b.potential)) return 1; //b is better
			*/
        return -1; //assume a is better
      });
      //console.log(this.serverList);

      //if the best server has lowish potential, it might be better to do other things
      if (this.serverList.length > 0) {
        if (this.serverList[0].potential < 0.75) {
          //this is arbitrary
          //such as installing something
          if (optionList.includes("install")) {
            //hand full? install a memory diamond
            if (
              runner.clickTracker < 2 &&
              runner.grip.length > MaxHandSize(runner)
            ) {
              cardToInstall = this._copyOfCardExistsIn(
                "T400 Memory Diamond",
                runner.grip
              );
              if (cardToInstall) {
                if (ChoicesCardInstall(cardToInstall).length > 0)
                  return this._returnPreference(optionList, "install", {
                    cardToInstall: cardToInstall,
                    hostToInstallTo: null,
                  });
              }
            }
          }
        } else if (
          this.serverList[0].potential < 1.1 &&
          this.serverList[0].bestcost > 1.0 &&
          this.cardsWorthKeeping.length > 0
        ) {
          //the values are arbitrary but basically potential is low and cost is not negligible
          this._log("Favouring setup");
          this.serverList = [];
        }
      }

      if (this.serverList.length > 0) {
        this._log(
          "Best server to run is " +
            this.serverList[0].server.serverName +
            " with " +
            this.serverList[0].potential.toFixed(1) +
            " potential and " +
            this.serverList[0].bestcost.toFixed(1) +
            " cost"
        );
        this.rc.Print(this.serverList[0].bestpath, this.serverList[0].server);
		//use this server for cached path
	    this.cachedBestPath = this.serverList[0].bestpath;
		this.cachedComplete = true;
		this.cachedPathServer = this.serverList[0].server;

        var endPoint =
          this.serverList[0].bestpath[this.serverList[0].bestpath.length - 1];
        var runCreditCost = endPoint.runner_credits_spent;
        var runClickCost = endPoint.runner_clicks_spent;

        //maybe install something first?
        if (optionList.includes("install")) {
          //Docklands if the server is HQ and Docklands is in worthkeeping
          if (this.serverList[0].server == corp.HQ) {
            cardToInstall = this._copyOfCardExistsIn(
              "Docklands Pass",
              this.cardsWorthKeeping
            );
            if (cardToInstall) {
              if (ChoicesCardInstall(cardToInstall).length > 0)
                return this._returnPreference(optionList, "install", {
                  cardToInstall: cardToInstall,
                  hostToInstallTo: null,
                });
            }
          }
          //Conduit if the server is R&D and Conduit is in worthkeeping
          if (this.serverList[0].server == corp.RnD) {
            cardToInstall = this._copyOfCardExistsIn(
              "Conduit",
              this.cardsWorthKeeping
            );
            if (cardToInstall) {
              if (ChoicesCardInstall(cardToInstall).length > 0)
                return this._returnPreference(optionList, "install", {
                  cardToInstall: cardToInstall,
                  hostToInstallTo: null,
                });
            }
          }
          //Leech
          if (typeof (this.serverList[0].server.cards !== "undefined")) {
            //central
            cardToInstall = this._copyOfCardExistsIn("Leech", runner.grip);
            if (cardToInstall) {
              if (!this._wastefulToInstall(cardToInstall)) {
                var choices = ChoicesCardInstall(cardToInstall);
                if (choices.length > 0) {
                  //this checks credits, mu, available hosts, etc.
                  var preferredInstallChoice =
                    cardToInstall.AIPreferredInstallChoice(choices);
                  if (preferredInstallChoice > -1) {
                    return this._returnPreference(optionList, "install", {
                      cardToInstall: cardToInstall,
                      hostToInstallTo: choices[preferredInstallChoice].host,
                    });
                  }
                }
              }
            }
          }
          //Tranquilizer
          if (runner._renderOnlyMU > 3) {
            //only make a it a priority if there's spare MU (don't take slots that might be breakers later)
            cardToInstall = this._copyOfCardExistsIn(
              "Tranquilizer",
              runner.grip
            );
            if (cardToInstall) {
              if (!this._wastefulToInstall(cardToInstall)) {
                var choices = ChoicesCardInstall(cardToInstall);
                if (choices.length > 0) {
                  //this checks credits, mu, available hosts, etc.
                  var preferredInstallChoice =
                    cardToInstall.AIPreferredInstallChoice(choices);
                  if (preferredInstallChoice > -1) {
                    return this._returnPreference(optionList, "install", {
                      cardToInstall: cardToInstall,
                      hostToInstallTo: choices[preferredInstallChoice].host,
                    });
                  }
                }
              }
            }
          }
          //Red Team if the run can be made with 2 less credits and 1 less click, and this server hasn't been run this turn
          if (typeof (this.serverList[0].server.cards !== "undefined")) {
            //central
            if (
              runCreditCost < AvailableCredits(runner) - 2 &&
              runClickCost < runner.clickTracker - 1
            ) {
              cardToInstall = this._copyOfCardExistsIn("Red Team", runner.grip);
              if (cardToInstall) {
                var alreadyRunThisTurn = false;
                if (this.serverList[0].server == corp.HQ)
                  alreadyRunThisTurn = cardToInstall.runHQ;
                else if (this.serverList[0].server == corp.RnD)
                  alreadyRunThisTurn = cardToInstall.runRnD;
                else if (this.serverList[0].server == corp.archives)
                  alreadyRunThisTurn = cardToInstall.runArchives;
                if (!alreadyRunThisTurn) {
                  if (ChoicesCardInstall(cardToInstall).length > 0)
                    return this._returnPreference(optionList, "install", {
                      cardToInstall: cardToInstall,
                      hostToInstallTo: null,
                    });
                }
              }
            }
          }
        }

        //maybe run by playing a run event?
        if (optionList.includes("play")) {
          //if Overclock has been suggested, decompensate to see if it's necessary (just check the path cost credits, don't recalculate)
          if (this.serverList[0].useOverclock) {
            if (
              AvailableCredits(runner) <
              this.serverList[0].bestpath[
                this.serverList[0].bestpath.length - 1
              ].runner_credits_spent
            ) {
              //i.e the run uses more than the credit available without Overclock
              return this._returnPreference(optionList, "play", {
                cardToPlay: this.serverList[0].useOverclock,
                nextPrefs: { chooseServer: this.serverList[0].server },
              });
            }
          }

          //playing a card would reduce the max damage, make sure it is still safe
          var pathdamage = this.rc.TotalDamage(
            this.rc.TotalEffect(
              this.serverList[0].bestpath[
                this.serverList[0].bestpath.length - 1
              ]
            )
          );
          if (pathdamage < runner.grip.length) {
            var unrezzedIceThisServer = 0;
            for (var i = 0; i < this.serverList[0].server.ice.length; i++) {
              if (!this.serverList[0].server.ice[i].rezzed)
                unrezzedIceThisServer++;
            }
            //if there are no unrezzed ice
            if (unrezzedIceThisServer == 0) {
              //maybe Jailbreak (costs no credits so no need to recalculate run)
              //only for HQ and R&D and if there is more than 1 card
              if (
                this.serverList[0].server == corp.HQ ||
                this.serverList[0].server == corp.RnD
              ) {
                var minCardsWorth = 2;
                if (this.serverList[0].server == corp.HQ) {
                  //special case: Docklands bonus
                  var docklands = this._copyOfCardExistsIn(
                    "Docklands Pass",
                    runner.rig.hardware
                  );
                  if (docklands) {
                    if (!docklands.breachedHQThisTurn) minCardsWorth++;
                  }
                }
                var worthJailbreak =
                  this.serverList[0].server.cards.length >= minCardsWorth;
                if (this.serverList[0].server == corp.RnD) {
                  if (
                    this._countNewCardsThatWouldBeAccessedInRnD(
                      minCardsWorth
                    ) == 0
                  )
                    worthJailbreak = false;
                }
                if (worthJailbreak) {
                  cardToPlay = this._copyOfCardExistsIn(
                    "Jailbreak",
                    runner.grip
                  );
                  if (FullCheckPlay(cardToPlay)) {
                    return this._returnPreference(optionList, "play", {
                      cardToPlay: cardToPlay,
                      nextPrefs: { chooseServer: this.serverList[0].server },
                    });
                  }
                }
              }
            } //otherwise (there are any unrezzed ice)
            else {
              if (this.serverList[0].potential > 1.5) {
                //save Tread Lightly for high value targets
                //maybe Tread Lightly (costs 1 credit but no need to recalculate run because the ice is unrezzed anyway)
                if (AvailableCredits(corp) < 5 + 5 * unrezzedIceThisServer) {
                  //arbitrary but basically about making the corp pay more for stuff (not worth it if super rich)
                  cardToPlay = this._copyOfCardExistsIn(
                    "Tread Lightly",
                    runner.grip
                  );
                  if (FullCheckPlay(cardToPlay)) {
                    return this._returnPreference(optionList, "play", {
                      cardToPlay: cardToPlay,
                      nextPrefs: { chooseServer: this.serverList[0].server },
                    });
                  }
                }
              }
            }
          }
        }

        //maybe run by triggering a run ability
        if (useConduit && this.serverList[0].server == corp.RnD)
          return this._returnPreference(optionList, "trigger", {
            cardToTrigger: useConduit,
            nextPrefs: { chooseServer: this.serverList[0].server },
          });
        if (useRedTeam) {
          var redTeamServer = null;
          if (!useRedTeam.runHQ && this.serverList[0].server == corp.HQ)
            redTeamServer = corp.HQ;
          else if (!useRedTeam.runRnD && this.serverList[0].server == corp.RnD)
            redTeamServer = corp.RnD;
          else if (
            !useRedTeam.runArchives &&
            this.serverList[0].server == corp.archives
          )
            redTeamServer = corp.archives;
          if (redTeamServer)
            return this._returnPreference(optionList, "trigger", {
              cardToTrigger: useRedTeam,
              nextPrefs: { chooseServer: redTeamServer },
            });
        }

        return this._returnPreference(optionList, "run", {
          serverToRun: this.serverList[0].server,
        });
      }
    }

    //if not running...then maybe need to draw?
    this._log("Don't want to run right now");
    var maxOverDraw = 0; //max number of cards to go over max hand size
    if (runner.clickTracker > 2 && Credits(runner) > 0)
      maxOverDraw = runner.clickTracker - 2; //ok to draw extra early in turn if not completely broke (might find good econ)
    var currentOverDraw = runner.grip.length - MaxHandSize(runner);
    if (currentOverDraw < maxOverDraw) {
      //a card that could be installed?
      if (optionList.includes("install")) {
        for (var i = 0; i < this.drawInstall.length; i++) {
          //if this.drawInstall[i] is found in hand, and can be installed, install it
          cardToInstall = this._copyOfCardExistsIn(
            this.drawInstall[i],
            runner.grip
          );
          if (cardToInstall) {
            if (!this._wastefulToInstall(cardToInstall)) {
              this._log("there is a card I'd like to install");
              var canBeInstalled = true;
              if (!CheckInstall(cardToInstall)) canBeInstalled = false;
              //this doesn't check costs
              else if (ChoicesCardInstall(cardToInstall).length < 1)
                canBeInstalled = false; //this checks credits, mu, available hosts, etc.
              if (canBeInstalled) {
                this._log("and I could install it");
                return this._returnPreference(optionList, "install", {
                  cardToInstall: cardToInstall,
                  hostToInstallTo: null,
                }); //assumes unhosted cards for now
              }
            }
          }
        }
      }

      //or maybe an event card?
      if (optionList.includes("play")) {
        this.drawPlay = []; //cards which can be played to draw cards
        if (currentOverDraw + 2 < maxOverDraw) this.drawPlay.push("VRcation"); //simple arbitrary bonus to current draw to prevent wild overdraw (and try to take into account the one this will burn)
        if (currentOverDraw + 1 < maxOverDraw)
          this.drawPlay.push("Wildcat Strike"); //simple arbitrary bonus to current draw to prevent wild overdraw
        for (var i = 0; i < this.drawPlay.length; i++) {
          //if this.drawPlay[i] is found in hand, and can be played, play it
          cardToPlay = this._copyOfCardExistsIn(this.drawPlay[i], runner.grip);
          if (cardToPlay) {
            this._log("there is a card I'd like to play");
            if (FullCheckPlay(cardToPlay)) {
              this._log("and I could play it");
              return this._returnPreference(optionList, "play", {
                cardToPlay: cardToPlay,
              });
            }
          }
        }
      }

      //just an ordinary draw action, then
      if (optionList.includes("draw")) return optionList.indexOf("draw");
    }

    //nothing else worth doing? consider making money
    var prioritiseEconomy = true;
    //economy check is pretty simple at the moment (and arbitrary)
    if (runner.creditPool > 12) {
      //&&(runner.creditPool > corp.creditPool))
      this._log("Don't need more credits right now");
      prioritiseEconomy = false;
    }
    if (prioritiseEconomy) {
      this._log("More credits could be nice");
      //something to play?
      if (optionList.includes("play")) {
        for (var i = 0; i < this.economyPlay.length; i++) {
          //if this.economyPlay[i] is found in hand, and can be played, play it
          cardToPlay = this._copyOfCardExistsIn(
            this.economyPlay[i],
            runner.grip
          );
          if (cardToPlay) {
            this._log("maybe by playing a card?");
            if (
              FullCheckPlay(cardToPlay) &&
              !this._wastefulToPlay(cardToPlay)
            ) {
              this._log("there's one I could play");
              return this._returnPreference(optionList, "play", {
                cardToPlay: cardToPlay,
              });
            }
          }
        }
      }
      //or trigger?
      if (optionList.includes("trigger")) {
        var activeCards = ActiveCards(runner);
        var limitTo = "";
        if (currentPhase.identifier == "Runner 1.3") limitTo = "click";
        for (var i = 0; i < this.economyTrigger.length; i++) {
          var exclude = []; //use this to loop through options rather than stopping at one
          var title = this.economyTrigger[i];
          //if a copy of this card is active and can be triggered, trigger it
          cardToTrigger = this._copyOfCardExistsIn(title, activeCards);
          //some triggers would be better not to use right now
          while (cardToTrigger) {
            exclude.push(cardToTrigger); //in case we need to look for other copies
            if (typeof cardToTrigger.AIWouldTriggerThis == "function") {
              if (!cardToTrigger.AIWouldTriggerThis()) cardToTrigger = null;
            }
            if (cardToTrigger) {
              this._log("maybe by triggering an ability?");
              if (ChoicesAbility(cardToTrigger, limitTo).length > 0) {
                //i.e. it can be triggered
                this._log("there's one I could trigger");
                return this._returnPreference(optionList, "trigger", {
                  cardToTrigger: cardToTrigger,
                }); //assume no parameters for now
              }
            }
            //if we didn't trigger that copy, maybe another copy?
            cardToTrigger = this._copyOfCardExistsIn(
              title,
              activeCards,
              exclude
            );
          }
        }
      }
      //or maybe install?
      if (optionList.includes("install")) {
        for (var i = 0; i < this.economyInstall.length; i++) {
          //if this.economyInstall[i] is found in hand, and can be installed, install it
          cardToInstall = this._copyOfCardExistsIn(
            this.economyInstall[i],
            runner.grip
          );
          if (cardToInstall) {
            this._log("maybe by installing a card?");
            var canBeInstalled = true;
            var choices = ChoicesCardInstall(cardToInstall);
            if (!CheckInstall(cardToInstall)) canBeInstalled = false;
            //this doesn't check costs
            else if (choices.length < 1) canBeInstalled = false;
            //this checks credits, mu, available hosts, etc.
            else if (
              typeof cardToInstall.AIPreferredInstallChoice == "function"
            ) {
              if (cardToInstall.AIPreferredInstallChoice(choices) < 0)
                canBeInstalled = false; //card AI code deemed it unworthy
            }
            if (canBeInstalled && !this._wastefulToInstall(cardToInstall)) {
              this._log("there's one I could install");
              return this._returnPreference(optionList, "install", {
                cardToInstall: cardToInstall,
                hostToInstallTo: null,
              }); //assumes unhosted cards for now
            }
          }
        }
      }
    }

    //other cards that may or may not be economy but were considered to be worthwhile
    for (var i = 0; i < this.cardsWorthKeeping.length; i++) {
      var card = this.cardsWorthKeeping[i];
      if (card.cardType == "event" && optionList.includes("play")) {
        //play
        if (FullCheckPlay(card) && !this._wastefulToPlay(card)) {
          this._log("there's a card worth playing");
          return this._returnPreference(optionList, "play", {
            cardToPlay: card,
          });
        }
      } else if (optionList.includes("install")) {
        //install
        var canBeInstalled = true;
        var choices = ChoicesCardInstall(card);
        if (!CheckInstall(card)) canBeInstalled = false;
        //this doesn't check costs
        else if (choices.length < 1) canBeInstalled = false;
        //this checks credits, mu, available hosts, etc.
        else if (typeof card.AIPreferredInstallChoice == "function") {
          if (card.AIPreferredInstallChoice(choices) < 0)
            canBeInstalled = false; //card AI code deemed it unworthy
        }
        if (canBeInstalled && !this._wastefulToInstall(card)) {
          this._log("there's one I could install");
          return this._returnPreference(optionList, "install", {
            cardToInstall: card,
            hostToInstallTo: null,
          }); //assumes unhosted cards for now
        }
      }
    }

    //more reasons to install and play (defined per card, BUT don't install low priority stuff if there are cards-worth-keeping which we can't afford yet)
    if (this.cardsWorthKeeping.length < 1) {
      for (var i = 0; i < runner.grip.length; i++) {
        var card = runner.grip[i];
        if (card.cardType == "event") {
          //i.e. play
          /* commented out - don't just play random events
				if (optionList.includes("play"))
				{
					var playThis = true; //if no specific rules have been defined then just play it whenever you can
					if (typeof(card.AIWouldPlay) == 'function') playThis = card.AIWouldPlay();
					if (playThis&&FullCheckPlay(card)&&(!this._wastefulToPlay(card)))
					{
this._log("maybe play this...");
						return this._returnPreference(optionList, "play", { cardToPlay:card });
					}
				}
				*/
        } //non-event (i.e. install)
        else {
          if (
            optionList.includes("install") &&
            !this._wastefulToInstall(card)
          ) {
            var choices = ChoicesCardInstall(card);
            if (choices.length > 0) {
              var preferredInstallChoice = 0; //if no specific rules have been defined then just install it whenever you can
              //AIPreferredInstallChoice(choices) outputs the preferred index from the provided choices list (return -1 to not install)
              if (typeof card.AIPreferredInstallChoice == "function")
                preferredInstallChoice = card.AIPreferredInstallChoice(choices);
              if (preferredInstallChoice > -1 && CheckInstall(card)) {
                this._log("maybe install this...");
                return this._returnPreference(optionList, "install", {
                  cardToInstall: card,
                  hostToInstallTo: choices[preferredInstallChoice].host,
                });
              }
            }
          }
        }
      }
    }

    //well, just click for credits I guess
    if (optionList.includes("gain")) {
      //unless we're too rich in which case need more options so draw cards
      if (!prioritiseEconomy && optionList.includes("draw"))
        return optionList.indexOf("draw");
      return optionList.indexOf("gain");
    }

    //*** END DECISIONMAKING LOGIC ***

    //uncertain? choose at random
    this._log(
      "AI (" +
        currentPhase.identifier +
        "): No decision made, choosing at random from:"
    );
    this._log(JSON.stringify(optionList));
    this._log("Current phase identifier: " + currentPhase.identifier);
    this._log("Current phase title: " + currentPhase.title);
    this._log("Executing command: " + executingCommand);
    return RandomRange(0, optionList.length - 1);
  }

  CommandChoice(optionList) {
    return this.Choice(optionList, "command");
  }

  SelectChoice(optionList) {
    return this.Choice(optionList, "select");
  }

  GameEnded(winner) {}
}
